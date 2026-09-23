/**
 * Which sandbox a session's agent work runs in, and how many of them this host
 * will hand out at once.
 *
 * `./factory` imports the finished `sandbox` slot from here and passes it
 * straight to `MastraFactory`. Unlike the other modules in this directory
 * this one has no load-time side effect — the constants and the
 * `liveDockerSandboxes` registry are inert, and nothing is constructed until the
 * factory calls the slot for a session — so its import position there is free,
 * and it is last only for readability.
 *
 * The branch ORDER inside `selectSandbox` is the load-bearing part: `docker` is
 * evaluated ahead of the Platform and E2B arms, which is what keeps agent work
 * on this host structurally rather than contingently while `@mastra/e2b` and
 * `@mastra/platform-workspace` stay installed. `sandbox/README.md` is the
 * operator-facing record of the same guarantee.
 *
 * This module is the one first-party read site for every key below (AD-7). See
 * `README.md` in this directory.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LocalSandbox } from '@mastra/core/workspace';
import { DockerSandbox, type DockerSandboxOptions } from '@mastra/docker';
import { PlatformSandbox, createRepoTemplate as createPlatformRepoTemplate } from '@mastra/platform-workspace';
import { E2BSandbox, createRepoTemplate as createE2BRepoTemplate } from '@mastra/e2b';
import { positiveInt } from './positive-int';
import type { MastraSandbox } from '@mastra/core/workspace';
import type { FactorySandboxContext } from '@mastra/factory';

// Host env exposed to local sandboxes: an allow-list only, so app secrets
// (GITHUB_APP_PRIVATE_KEY, WORKOS_API_KEY, DATABASE_URL, …) never leak into
// commands run against untrusted repo checkouts. PATH is always added by the
// core LocalSandbox itself; the rest keeps git and TLS working normally.
// Exported for `sandbox.test.ts` only — nothing else imports it.
export const LOCAL_SANDBOX_ENV_KEYS = [
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TERM',
  'TZ',
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
] as const;

/** Exported for `sandbox.test.ts` only — nothing else imports it. */
export function localSandboxEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of LOCAL_SANDBOX_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

// Hard ceilings for one Docker-sandbox session container. They are ceilings,
// not reservations: `sandbox/README.md` explains why the numbers for this host
// are what they are. That sizing assumes a concurrent-session count, and
// `MASTRACODE_MAX_SANDBOXES` is that count — applied by `admitDockerSession`
// below, which is the only place it can be applied: no installed package caps
// concurrent sessions (`maxSandboxes` went away with the sandbox fleet — there
// is one sandbox per session and no pool to cap), and the `sandbox:` slot is
// the one piece of first-party code that runs before a session's container is
// created.
//
// Docker's CPU limit is a CFS quota, which only means "N cores" relative to the
// period it is divided by — so the period is pinned here rather than left to
// the daemon's default, and the quota is always derived from it.
const DOCKER_SANDBOX_CPU_PERIOD_US = 100_000;
const DOCKER_SANDBOX_DEFAULT_CPUS = 4;
const DOCKER_SANDBOX_DEFAULT_MEMORY_GIB = 10;
// The third leg of the same arithmetic as the two ceilings above: 3 × 10 GiB is
// this host's whole memory budget. Like them it is a default, not a switch —
// there is no value meaning "unlimited", and a malformed one falls back here.
const DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES = 3;
const BYTES_PER_GIB = 1024 ** 3;
// `HostConfig.PidsLimit`. An init process (`HostConfig.Init`, pinned below)
// reaps the zombies an aborted command leaves behind, which is what keeps this
// from leaking away over a long-lived session container.
const DOCKER_SANDBOX_PIDS_LIMIT = 4096;
// Default per-command timeout. The package default is 5 minutes, which a repo
// install or a test suite routinely exceeds.
const DOCKER_SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_SANDBOX_WORKDIR = '/workspace';

/**
 * Build the Docker sandbox options for one session.
 *
 * Extracted from the `sandbox:` callback because these numbers are the part of
 * the Docker branch that can silently be wrong — a quota computed against the
 * wrong period, or gibibytes passed where bytes were meant, is invisible until
 * a container either ignores its cap or is OOM-killed on sight. Nothing else in
 * this repository can observe a `DockerSandboxOptions`, so they are asserted in
 * `sandbox.test.ts` instead.
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it.
 */
export function dockerSandboxOptions(sessionId: string): DockerSandboxOptions {
  // No honest default exists. `DockerSandboxOptions.image` falls back to
  // `node:22-slim`, which carries neither `git` nor `gh`, so a session started
  // on it fails at first use with Factory's `git-missing` — the exact failure
  // the purpose-built image exists to prevent. The only correct value is a tag
  // someone built on this host, so refuse and name the key. The slot is called
  // per session, so this surfaces at the first session rather than at boot.
  const image = process.env.FACTORY_SANDBOX_IMAGE?.trim();
  if (!image) {
    throw new Error(
      'FACTORY_SANDBOX_IMAGE is required when the docker sandbox provider is selected. Set it to an image ' +
        'built on this host that carries git and the GitHub CLI (see sandbox/README.md); there is no safe default.',
    );
  }

  const memoryGib = positiveInt(process.env.FACTORY_SANDBOX_MEMORY_GIB) ?? DOCKER_SANDBOX_DEFAULT_MEMORY_GIB;
  const cpus = positiveInt(process.env.FACTORY_SANDBOX_CPUS) ?? DOCKER_SANDBOX_DEFAULT_CPUS;
  const memoryBytes = memoryGib * BYTES_PER_GIB;

  return {
    // The sandbox identity Factory keys its get-or-create on, so a reconnecting
    // session reattaches to its container instead of provisioning a second one.
    id: sessionId,
    image,
    memory: memoryBytes,
    // Equal to `memory`, which disables swap. Omitted, Docker defaults
    // MemorySwap to twice Memory, so a "10 GiB cap" would really be 10 GiB of
    // RAM plus 10 GiB of swap — double the budget this host is sized against.
    memorySwap: memoryBytes,
    cpuPeriod: DOCKER_SANDBOX_CPU_PERIOD_US,
    cpuQuota: cpus * DOCKER_SANDBOX_CPU_PERIOD_US,
    pidsLimit: DOCKER_SANDBOX_PIDS_LIMIT,
    // `HostConfig.Init`. Pinned rather than left to the package's own default:
    // Docker's `--init` is off by default and only `@mastra/docker` turns it
    // on, so the zombie reaping `pidsLimit` above depends on — and that
    // `sandbox/README.md` states as a property of every session container —
    // would otherwise be a package default a minor upgrade could flip silently.
    init: true,
    timeout: DOCKER_SANDBOX_TIMEOUT_MS,
    // The base-class option, NOT the package's deprecated same-named alias
    // (`sandbox.test.ts` pins that the alias is absent).
    workingDirectory: process.env.MASTRACODE_SANDBOX_WORKDIR?.trim() || DEFAULT_SANDBOX_WORKDIR,
    // No `dockerOptions`: dockerode reads DOCKER_HOST itself, and ops/README.md
    // owns that key — re-reading it here would be a second source of truth.
  };
}

/**
 * The Docker session sandboxes this process has handed out, keyed by session id.
 *
 * Factory memoizes the instance the `sandbox:` slot returns
 * (`@mastra/factory/dist/sandbox/session-sandbox.js`), so the slot is called
 * once per NEW session id — which makes this map's size the number of session
 * containers this process has asked for and not yet seen retired.
 *
 * It is module-level rather than a `selectSandbox` local because the cap has to
 * outlive a single call, and it is passed into `selectSandbox` as a defaulted
 * parameter so a test can supply its own instead of leaking state between tests.
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it. Without the
 * export no test can reach the map the production call site actually binds to,
 * and defaulting the parameter to a fresh `new Map()` — which disables the cap
 * entirely — would leave `tsc` and every test green.
 */
export const liveDockerSandboxes = new Map<string, MastraSandbox>();

/**
 * Refuse a new Docker session once `MASTRACODE_MAX_SANDBOXES` are already live.
 *
 * Occupancy is read from each sandbox's own lifecycle `status` rather than from
 * a counter, because nothing hands this file a release hook: Factory retires a
 * session by calling `stop()`/`destroy()` on the very instance the slot returned,
 * and the core base class moves `status` to `stopped`/`destroyed` in those calls.
 * Reading the status therefore IS the release hook, with nothing to keep in sync.
 * Release is not instantaneous, though: `_executeStop` sets `stopping` and only
 * reaches `stopped` once the container stop has completed, so the slot is held
 * for the duration of the teardown. And a teardown that FAILS leaves `error`
 * instead — the base class sets it when `stop()`/`destroy()` throws, and
 * `SessionRetirementCoordinator` only warns — so that slot is held until the
 * server process restarts.
 *
 * `error` is deliberately not treated as released. It is set when the start
 * lifecycle throws, and the session setup (clone, checkout, setup command) runs
 * after the container has already been created and started — so an errored
 * sandbox very often still owns a running container, and freeing its slot would
 * overcommit the host exactly when something is already wrong.
 *
 * The count is per server process. Containers have no idle teardown and a
 * resumed session reattaches by a daemon label query, so containers outlive this
 * map across a restart; closing that would need an async `docker ps` and the slot
 * is a synchronous `(ctx) => MastraSandbox` whose construction must stay cheap.
 * `sandbox/README.md` states the per-process scope.
 */
function admitDockerSession(sessionId: string, liveSessions: Map<string, MastraSandbox>): void {
  for (const [id, sandbox] of liveSessions) {
    if (sandbox.status === 'stopped' || sandbox.status === 'destroyed') liveSessions.delete(id);
  }

  // A session this process already holds a sandbox for is reattaching, not
  // claiming a slot. Refusing it would make a resumed session unreachable
  // whenever the server happens to be at its cap.
  if (liveSessions.has(sessionId)) return;

  const maxSandboxes = positiveInt(process.env.MASTRACODE_MAX_SANDBOXES) ?? DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES;
  if (liveSessions.size < maxSandboxes) return;

  throw new Error(
    `MASTRACODE_MAX_SANDBOXES is ${maxSandboxes} and this server process already holds sandboxes for ` +
      `${liveSessions.size} live sessions, so this session cannot be given one. Let a running session's work ` +
      'item reach a terminal stage, or delete one of those sessions, to free a slot. Raise ' +
      'MASTRACODE_MAX_SANDBOXES only if this host has memory for another container at ' +
      'FACTORY_SANDBOX_MEMORY_GIB (see sandbox/README.md); there is no value that disables the cap.',
  );
}

/**
 * Pick the sandbox a session runs in. This is the `sandbox:` slot's whole body,
 * named and exported so `sandbox.test.ts` can pin the branch ORDER — which is
 * the only thing holding agent work on this host, and is otherwise invisible to
 * every check this repository has.
 *
 * `platformSandboxConfigured` is passed in rather than read here because the
 * platform env group is evaluated once at module load (see
 * `hasPlatformSandboxEnv`); keeping that read where it was makes this extraction
 * behavior-preserving, and lets a test exercise the "platform IS configured"
 * arm without smuggling a second read of those keys into this function.
 * `liveSessions` is injected the same way, and for the same reason: the cap is
 * per process, so its registry has to outlive the call.
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it.
 */
export function selectSandbox(
  ctx: FactorySandboxContext,
  platformSandboxConfigured: boolean,
  liveSessions: Map<string, MastraSandbox> = liveDockerSandboxes,
): MastraSandbox {
  // The one and only read of the sandbox-provider key (the const below is it;
  // `.env.schema` lists the name). `docker` is deliberately the FIRST branch,
  // evaluated ahead of the platform and E2B checks: on a self-hosted deployment
  // the guarantee that agent work stays on this host has to be structural, not
  // contingent on a stray MASTRA_PROJECT_ID or E2B_API_KEY never appearing in
  // `.env`. Any other value falls through unchanged, so an unrecognised
  // provider never turns into a boot failure.
  const sandboxProvider = process.env.FACTORY_SANDBOX_PROVIDER?.trim();
  if (sandboxProvider === 'docker') {
    // Order matters twice here. The image is resolved FIRST: a missing image
    // breaks every session on this deployment, while the cap only refuses this
    // one, so the more general failure is the one to report. And the sandbox is
    // registered only after construction succeeded, so a throw never burns a
    // slot. Both failures leave the docker branch by throwing rather than
    // returning, which is what keeps a refusal from falling through to the
    // Platform or E2B arms below and relocating the work off this host.
    const options = dockerSandboxOptions(ctx.sessionId);
    admitDockerSession(ctx.sessionId, liveSessions);
    const sandbox = new DockerSandbox(options);
    liveSessions.set(ctx.sessionId, sandbox);
    return sandbox;
  }

  const useLocalSandbox = sandboxProvider === 'local';
  if (!useLocalSandbox && platformSandboxConfigured) {
    return new PlatformSandbox({
      id: ctx.sessionId,
      template: createPlatformRepoTemplate(ctx),
    });
  }

  if (!useLocalSandbox && process.env.E2B_API_KEY?.trim()) {
    return new E2BSandbox({
      id: ctx.sessionId,
      template: createE2BRepoTemplate(ctx),
    });
  }

  return new LocalSandbox({
    workingDirectory: join(
      process.env.MASTRACODE_LOCAL_SANDBOX_ROOT?.trim() || join(homedir(), '.mastracode', 'web', 'sandboxes'),
      ctx.sessionId,
    ),
    env: localSandboxEnv(),
  });
}

const hasPlatformSandboxEnv =
  ['MASTRA_PLATFORM_ACCESS_TOKEN', 'MASTRA_PLATFORM_SECRET_KEY'].some(key => Boolean(process.env[key]?.trim())) &&
  ['MASTRA_ENVIRONMENT_ID', 'MASTRA_PROJECT_ID'].every(key => Boolean(process.env[key]?.trim()));

/**
 * The finished `sandbox:` slot `./factory` hands to `MastraFactory`.
 *
 * The platform-env check is resolved once, at module load, and closed over —
 * exactly as it was when this arrow lived inline in the factory call — so the
 * four Platform keys are read once per process and `selectSandbox` keeps taking
 * the answer as an argument.
 */
export const sandbox = (ctx: FactorySandboxContext): MastraSandbox => selectSandbox(ctx, hasPlatformSandboxEnv);
