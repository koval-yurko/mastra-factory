/**
 * Platform-deployable Mastra entry for MastraCode.
 *
 * This module is the ONE place deployment env is read. It maps today's env
 * vars onto explicit `MastraFactory` config — instances for behaviors (pubsub,
 * storage, vector), plain values for config (publicUrl, origins) — so anyone
 * reading the entry sees exactly which env var feeds which slot.
 * Everything else (feature readiness, route/middleware assembly, controller
 * construction) lives in `MastraFactory` (`@mastra/factory`).
 *
 * `mastra build` requires the entry to export a `Mastra` instance named
 * `mastra` constructed by a literal `new Mastra(...)` in THIS file (validated
 * by the deployer's `checkConfigExport` Babel plugin) — which is why the
 * factory returns constructor args from `prepare()` instead of the instance.
 * The Mastra CLI consumes this entry everywhere: `mastra dev`, `mastra build`,
 * and `mastra deploy` all bundle this module and let the deployer generate
 * the server.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLFactoryStorage } from '@mastra/libsql';
import { PgVector, PgFactoryStorage } from '@mastra/pg';
import { LocalSandbox } from '@mastra/core/workspace';
import { DockerSandbox, type DockerSandboxOptions } from '@mastra/docker';
import { PlatformSandbox, createRepoTemplate as createPlatformRepoTemplate } from '@mastra/platform-workspace';
import { E2BSandbox, createRepoTemplate as createE2BRepoTemplate } from '@mastra/e2b';
import { RedisStreamsPubSub } from '@mastra/redis-streams';
import { getDatabasePath } from '@mastra/code-sdk/utils/project';
import { DEFAULT_RETENTION } from '@mastra/code-sdk/utils/storage-maintenance';
import { MastraAuthBetterAuth } from '@mastra/auth-better-auth';
import { createFactorySecretEncryption, MastraFactory } from '@mastra/factory';
import { GithubIntegration } from '@mastra/factory/integrations/github/integration';
import { parseAuthorizedBotsEnv } from '@mastra/factory/integrations/github/webhook';
import { LinearIntegration } from '@mastra/factory/integrations/linear/integration';
import { SlackIntegration } from '@mastra/factory/integrations/slack/integration';
import type { IMastraAuthProvider } from '@mastra/core/server';
import type { MastraSandbox } from '@mastra/core/workspace';
import type { FactorySandboxContext } from '@mastra/factory';

/**
 * Parse a positive-integer env knob; anything else means "use the default".
 * Fractional values are rejected rather than floored — flooring `0.5` to `0`
 * would silently disable a capacity knob or turn an idle window into
 * immediate expiry.
 *
 * Exported for `index.test.ts` only — nothing else imports it.
 */
export function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/**
 * Decode a base64 32-byte credential-encryption key. `name` is the environment
 * variable the value came from and is carried into the failure message, so a
 * boot failure points at the key rather than at the decoder.
 *
 * Exported for `index.test.ts` only — nothing else imports it.
 */
export function decodeCredentialEncryptionKey(name: string, encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.byteLength !== 32) throw new Error(`${name} must contain base64-encoded 32-byte keys.`);
  return key;
}

function credentialEncryption() {
  const encodedKey = process.env.FACTORY_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encodedKey) {
    console.warn(
      '[factory] FACTORY_CREDENTIAL_ENCRYPTION_KEY is not set. Stored model-provider keys, custom-provider ' +
        'API keys, and integration secrets will be persisted as plaintext. Generate a key with ' +
        '`openssl rand -base64 32` and set FACTORY_CREDENTIAL_ENCRYPTION_KEY to encrypt them at rest.',
    );
    return undefined;
  }

  const previousKeys: Record<string, unknown> = process.env.FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS
    ? JSON.parse(process.env.FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS)
    : {};
  if (!previousKeys || Array.isArray(previousKeys) || typeof previousKeys !== 'object') {
    throw new Error('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of key ids to base64 keys.');
  }

  return createFactorySecretEncryption({
    primary: {
      id: process.env.FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID?.trim() || 'v1',
      key: decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', encodedKey),
    },
    previous: Object.entries(previousKeys).map(([id, value]) => {
      if (typeof value !== 'string') {
        throw new Error('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS values must be base64 strings.');
      }
      return { id, key: decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS', value) };
    }),
  });
}

// Distributed pub/sub: when `REDIS_URL` is set, events (streams, workflows,
// signals) ride Redis Streams so multiple web server processes can share one
// event bus. RedisStreamsPubSub also implements LeaseProvider, so the factory
// marks it cross-process and the controller drops its file-based thread locks
// in favor of pubsub-coordinated leases. Without `REDIS_URL` (bare local dev)
// the in-process default applies.
const redisUrl = process.env.REDIS_URL;
const pubsub = redisUrl ? new RedisStreamsPubSub({ url: redisUrl }) : undefined;
if (redisUrl) {
  // Redact credentials before logging (REDIS_URL may embed a password).
  let redisTarget = 'redis';
  try {
    const parsed = new URL(redisUrl);
    redisTarget = `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Unparseable URL — RedisStreamsPubSub will surface the real error; keep the log generic.
  }
  console.log(`[PubSub] REDIS_URL set — event bus on Redis Streams (${redisTarget}), cross-process leases enabled.`);
}

/**
 * Auth selection, ordered by how explicit the operator's intent is:
 *   1. MASTRACODE_AUTH_DISABLED=1 — explicit opt-out, auth off entirely.
 *   2. MASTRA_SHARED_API_URL — explicit platform deferral; identity rides the
 *      shared platform API (`.env.schema` names this the highest-precedence
 *      auth config), so it wins even over a configured BETTER_AUTH_SECRET —
 *      but loudly, because silently ignoring sign-in config is how self-hosted
 *      logins end up 302-ing somewhere that rejects their redirect_uri.
 *   3. BETTER_AUTH_SECRET — self-managed sign-in this deployment owns, with no
 *      external identity provider in the path. The provider is constructed in
 *      DEFERRED-INSTANCE mode (a `secret`, no `auth` instance): `MastraFactory`
 *      calls `init()` with the auth-database handle `FactoryStorage` exposes,
 *      so the provider builds its own Better Auth instance on the SAME database
 *      and connection string as the app tables (`DATABASE_URL`, or the local
 *      libSQL file in bare dev), owns its migrations — lazily, on first
 *      request, never at boot — and registers the organization plugin itself,
 *      which is what gives org-scoped features a real org without a hosted IdP.
 *      Nothing is passed here for the database or the browser-facing origin:
 *      `init()` takes the handle from the host and derives the origin from the
 *      factory's `publicUrl` (MASTRACODE_PUBLIC_URL, wired below), and a
 *      bring-your-own `auth` instance would skip the plugin, the migrations and
 *      the `/auth/api` base path entirely.
 *      Note MASTRA_PLATFORM_ACCESS_TOKEN / MASTRA_PLATFORM_SECRET_KEY do NOT
 *      defer to the platform here: they are compute/integration credentials
 *      (sandboxes, GitHub/Linear slots), not identity signals — platform
 *      compute plus self-managed sign-in is a supported combination.
 *   4. Nothing configured — leave undefined and MastraFactory installs its
 *      platform-backed default provider: `MastraAuthStudio`, which verifies
 *      identity against https://platform.mastra.ai. That is a third party in
 *      the sign-in path, and it is where a typo in BETTER_AUTH_SECRET's name
 *      lands silently — so deleting or reordering an arm above is not a
 *      failed sign-in, it is a working sign-in somewhere else.
 *
 * The chain is a function rather than module-level `if`/`else` because the
 * ORDER is the guarantee — that a stray MASTRA_SHARED_API_URL still wins, and
 * that nothing else does — and `vitest` cannot observe statements. Same reason
 * `selectSandbox` below is exported.
 *
 * Exported for `index.test.ts` only — nothing else imports it.
 */
export function selectAuth(): IMastraAuthProvider | null | undefined {
  if (process.env.MASTRACODE_AUTH_DISABLED === '1') return null;

  // A blank secret must never reach the constructor: `new MastraAuthBetterAuth({})`
  // throws ("Better Auth instance is required…") at module load, taking the whole
  // deployment down at boot with a message that names the wrong cause for an
  // operator who simply forgot the key. So gate on a trimmed, non-empty value and
  // otherwise fall through — exactly as an unconfigured WorkOS group did before.
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (process.env.MASTRA_SHARED_API_URL?.trim()) {
    if (betterAuthSecret) {
      console.warn(
        '[Auth] BETTER_AUTH_SECRET is set but ignored: MASTRA_SHARED_API_URL takes precedence, so sign-in defers to the platform. Unset MASTRA_SHARED_API_URL to use self-managed Better Auth sign-in.',
      );
    }
    return undefined;
  }

  if (betterAuthSecret) {
    return new MastraAuthBetterAuth({
      secret: betterAuthSecret,
      // Registration is CLOSED: no one can create an account against this
      // deployment, whoever reaches the sign-in page. This line is the whole
      // switch, and it is written out rather than omitted because the package
      // default is the opposite — `options.signUpEnabled ?? true` — so deleting
      // it silently reopens sign-up with a diff that never mentions sign-up.
      // It is deliberately NOT read from the environment: the guarantee is that
      // no `.env` value, stray export or bad deploy config can reopen
      // registration, so there is no key to set and nothing here to override.
      // To add a second account, open this file, set the field to `true`,
      // restart the server, create the account, set it back to `false` and
      // restart again — a reviewable edit and a restart, on purpose, twice.
      signUpEnabled: false,
      // `MastraAuthBetterAuthOptions` is declared but not exported by the
      // package, so the option type is named inline through the constructor
      // rather than imported. It documents the shape; it does not enforce
      // deferred-instance mode. `auth?` is a legal option on this type, so
      // adding an `auth:` instance here would typecheck while skipping the
      // organization plugin, the migrations and the `/auth/api` base path.
      // Only review keeps that out.
    } satisfies ConstructorParameters<typeof MastraAuthBetterAuth>[0]);
  }

  return undefined;
}

const auth = selectAuth();
const secretEncryption = auth === null ? undefined : credentialEncryption();

// Direct GitHub App fallback: when the platform-backed integration isn't in
// play (self-hosted / local deploys), a complete GITHUB_APP_* env group wires
// a GithubIntegration so the app still gets a real GitHub connection — Connect
// GitHub in onboarding, the repo picker, and webhooks. A partial group stays
// disabled so the status route can report exactly what's missing.
const githubAppId = process.env.GITHUB_APP_ID?.trim();
const githubPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
const githubClientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
const githubAppSlug = process.env.GITHUB_APP_SLUG?.trim();
const github =
  githubAppId && githubPrivateKey && githubClientId && githubClientSecret && githubAppSlug
    ? new GithubIntegration({
        appId: githubAppId,
        privateKey: githubPrivateKey,
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        slug: githubAppSlug,
        webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() || undefined,
        // Extra reviewer bot logins this deployment trusts to trigger
        // review/comment notifications, on top of the built-in defaults.
        authorizedBots: parseAuthorizedBotsEnv(process.env.MASTRACODE_GITHUB_AUTHORIZED_BOTS),
      })
    : undefined;

// Direct Linear OAuth fallback for self-hosted / local deploys. As with the
// GitHub fallback, only a complete credential group enables the integration;
// partial configuration remains available to the diagnostics routes.
const linearClientId = process.env.LINEAR_CLIENT_ID?.trim();
const linearClientSecret = process.env.LINEAR_CLIENT_SECRET?.trim();
const linear =
  linearClientId && linearClientSecret
    ? new LinearIntegration({
        clientId: linearClientId,
        clientSecret: linearClientSecret,
      })
    : undefined;

// Host env exposed to local sandboxes: an allow-list only, so app secrets
// (GITHUB_APP_PRIVATE_KEY, WORKOS_API_KEY, DATABASE_URL, …) never leak into
// commands run against untrusted repo checkouts. PATH is always added by the
// core LocalSandbox itself; the rest keeps git and TLS working normally.
// Exported for `index.test.ts` only — nothing else imports it.
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

/** Exported for `index.test.ts` only — nothing else imports it. */
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
 * `index.test.ts` instead.
 *
 * Exported for `index.test.ts` only — nothing else imports it.
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
    // (`index.test.ts` pins that the alias is absent).
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
 * Exported for `index.test.ts` only — nothing else imports it. Without the
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
 * named and exported so `index.test.ts` can pin the branch ORDER — which is the
 * only thing holding agent work on this host, and is otherwise invisible to
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
 * Exported for `index.test.ts` only — nothing else imports it.
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

// One FactoryStorage backend powers agent storage, the factory app tables,
// the distributed project lock, and better-auth. `DATABASE_URL` set →
// Postgres (the paired PgVector rides the same database for recall search).
// Unset (bare local dev) → libSQL on the same local file the SDK's default
// storage resolution uses, running the FULL app surface (auth, intake,
// audit, work-items, integrations) — no features silently off.
//
// `APP_DATABASE_URL` is the deprecated legacy name — still honored as a
// fallback so existing checkouts keep working, but new setups should use
// `DATABASE_URL` (matches the platform's managed env-var sync for attached
// databases, so `mastra deploy` populates it automatically).
const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.APP_DATABASE_URL?.trim() || undefined;
if (process.env.APP_DATABASE_URL?.trim() && !process.env.DATABASE_URL?.trim()) {
  console.warn(
    '[mastracode-web] APP_DATABASE_URL is deprecated — rename it to DATABASE_URL. ' +
      'The old name is honored as a fallback for now, but new deploys should use DATABASE_URL.',
  );
}
const localDevelopmentMode = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
if (!databaseUrl && !localDevelopmentMode) {
  throw new Error('DATABASE_URL is required outside local development and tests.');
}

const storage = databaseUrl
  ? new PgFactoryStorage({
      id: 'mastra-code-storage',
      connectionString: databaseUrl,
      retention: DEFAULT_RETENTION,
    })
  : new LibSQLFactoryStorage({
      id: 'mastra-code-storage',
      url: `file:${getDatabasePath()}`,
      retention: DEFAULT_RETENTION,
    });
const vector = databaseUrl ? new PgVector({ id: 'mastra-code-vectors', connectionString: databaseUrl }) : undefined;

// Deployment-stable secret for OAuth/link `state` signing. Shared by the
// factory's integration signer and the channel-account-link deep link so both
// sign/verify with the same key: webhook secret first, then the WorkOS cookie
// password, then the Slack signing secret so a Slack-only deployment still has
// a stable signer. Unset → per-process random secret (single-process local dev
// only).
const stateSecret =
  process.env.GITHUB_APP_WEBHOOK_SECRET ||
  process.env.WORKOS_COOKIE_PASSWORD ||
  process.env.SLACK_APP_SIGNING_SECRET ||
  undefined;

// Slack channels + account linking. Optional: the Slack adapter validates the
// signing secret at construction, so the integration is only built when the
// Slack app env is configured. Repo-backed Slack threads come from the
// factory's source-control owner (GitHub) — the integration wires itself.
const slackSigningSecret = process.env.SLACK_APP_SIGNING_SECRET?.trim();
const slack = slackSigningSecret
  ? new SlackIntegration({
      signingSecret: slackSigningSecret,
      botToken: process.env.SLACK_APP_BOT_TOKEN,
      clientId: process.env.SLACK_APP_CLIENT_ID?.trim(),
      clientSecret: process.env.SLACK_APP_CLIENT_SECRET?.trim(),
      // Slack requires an HTTPS redirect_uri, which locally is the tunnel
      // origin rather than the app's own public URL.
      oidcRedirectBaseUrl: process.env.MASTRACODE_CHANNELS_PUBLIC_URL ?? process.env.MASTRACODE_PUBLIC_URL,
      uiOrigin: process.env.MASTRACODE_PUBLIC_URL,
    })
  : undefined;

const integrations = [...(github ? [github] : []), ...(linear ? [linear] : []), ...(slack ? [slack] : [])];

export const factoryConfigVersion = 'mastracode-web-v1';

const hasPlatformSandboxEnv =
  ['MASTRA_PLATFORM_ACCESS_TOKEN', 'MASTRA_PLATFORM_SECRET_KEY'].some(key => Boolean(process.env[key]?.trim())) &&
  ['MASTRA_ENVIRONMENT_ID', 'MASTRA_PROJECT_ID'].every(key => Boolean(process.env[key]?.trim()));
export const factory = new MastraFactory({
  auth,
  secretEncryption,
  integrations,
  configVersion: factoryConfigVersion,
  sandbox: ctx => selectSandbox(ctx, hasPlatformSandboxEnv),
  // Per-replica cap on concurrent Factory background dispatches. Unset means
  // the dispatcher default; invalid and non-positive values are ignored.
  dispatcher: {
    maxInFlight: positiveInt(process.env.MASTRACODE_DISPATCH_MAX_IN_FLIGHT),
  },
  // Agent state (threads, messages, memory, OM, recall vectors) lives in the
  // single app Postgres alongside the github/app tables — one shared DB (and
  // pg pool) for all users, separated by `resourceId` scoping. Unset (bare
  // local dev) → default storage resolution applies (local libSQL file).
  storage,
  vector,
  pubsub,
  platform: {
    // The deployment's own self-hosted App slug, when one is configured. It is
    // NOT Platform's identity: Platform posts as its own App, which names
    // itself. Reusing this value for that purpose left self-recognition
    // comparing against `undefined[bot]` on every Platform deployment, where
    // this is legitimately unset.
    githubAppSlug,
  },
  // Browser-facing origin. On the platform the SPA is hosted separately, so
  // this MUST be set to the public API origin.
  publicUrl: process.env.MASTRACODE_PUBLIC_URL,
  // Allowed cross-origin SPA origins (comma-separated). The SPA is served from
  // a separate static host, so credentialed requests must be explicitly allowed.
  allowedOrigins: (process.env.MASTRACODE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  // Deployment-stable secret for OAuth `state` signing (GitHub/Linear connect
  // flows). See `stateSecret` above.
  stateSecret,
});

const preparedArgs = await factory.prepare();

// Construct the server-owned Mastra HERE so the `new Mastra(...)` literal lives
// in the entry file (see module docs). `prepare()` returns the constructor args
// carrying the controller (via `agentControllers`), storage, and the assembled
// `server` config (middleware + apiRoutes + cors). Keep the worker-relevant
// properties explicit so deploy builds can statically detect the worker topology.
export const mastra = new Mastra({
  ...preparedArgs,
  storage: preparedArgs.storage,
  pubsub: preparedArgs.pubsub,
  workers: preparedArgs.workers,
});

// Post-construct boot: initialize the controller (which now inherits this
// instance's storage) and start its workers. Runs at module load via top-level
// await, so the deployer imports a fully-booted instance.
await factory.finalize();
