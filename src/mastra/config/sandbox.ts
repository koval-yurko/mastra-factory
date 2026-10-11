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
 *
 * It is also the only module under `src/` that reads a file at runtime, and only
 * for one thing: the per-project `sandbox.json` under `sandbox/projects/`. That
 * config is committed beside the Dockerfile it goes with rather than carried in
 * an environment variable, because it describes a project's image and tooling as
 * much as its credentials, and a file is what a reviewer can see the whole of.
 * The working directory is therefore load-bearing here — it has to be the
 * repository root, which is what `npm run start` and `ops/factory-start.sh` both
 * guarantee, and what `warnIfNotRepoRoot` says out loud when it is not.
 */
import { existsSync, readFileSync } from 'node:fs';
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

// One path component of a repository slug — the `owner` or the `name` half of
// the `owner/name` form Factory reports a repository in
// (`FactorySandboxContext.repoFullName`), and therefore one directory level
// under `sandbox/projects/`. `.` and `..` satisfy the character class, so they
// are refused separately below: the slug is the one part of a path this module
// builds out of a value it did not author, and a component that walks up would
// read a `sandbox.json` from outside the tree it is supposed to come from.
const SLUG_COMPONENT = /^[A-Za-z0-9._-]+$/;

/** An environment variable name, on either side of a project's `env` mapping. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A per-project sandbox image: this repository's own `factory-sandbox` family,
 * date-stamped. The family prefix is what stops a project image from being an
 * arbitrary one — the refusal in `dockerSandboxOptions` below exists because the
 * package default carries neither `git` nor `gh`, and any image an operator can
 * name here carries the same hazard. The date stamp is the rollback property
 * `.env.schema` pins for the global image: two builds of one Dockerfile stay two
 * distinguishable tags.
 */
const PROJECT_IMAGE = /^factory-sandbox-[A-Za-z0-9._-]+:[0-9]{4}-[0-9]{2}-[0-9]{2}[A-Za-z0-9._-]*$/;

/** The fields a `sandbox.json` is read for. An unlisted one is a typo, refused below. */
const PROJECT_CONFIG_FIELDS = ['image', 'memoryGib', 'cpus', 'env'] as const;

/** Where a project's config lives, relative to the repository root. */
const PROJECT_CONFIG_ROOT = join('sandbox', 'projects');
const PROJECT_CONFIG_FILE = 'sandbox.json';
// A seeded artifact guard 23 of the bmad-loop gate keeps present at the
// repository root, which makes its absence a reliable "this is not the root"
// signal rather than a guess from one missing directory.
const REPO_ROOT_MARKER = join('sandbox', 'factory-sandbox.Dockerfile');

/**
 * What one project's `sandbox/projects/<owner>/<name>/sandbox.json` says about
 * its session containers. Every field is optional: a project that only needs a
 * credential forwarded writes only `env`, one that needs a tool the base image
 * does not carry writes `image` too, and one that needs nothing writes no file
 * at all and runs on the global configuration.
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it.
 */
export interface ProjectSandboxConfig {
  /** Image for this project's containers; absent uses the global one. */
  image?: string;
  /** Memory ceiling in whole gibibytes; absent uses the global one. */
  memoryGib?: number;
  /** CPU ceiling in whole cores; absent uses the global one. */
  cpus?: number;
  /**
   * Container variable name to the host variable whose value it receives. Keyed
   * by the container name on purpose: two host variables claiming one container
   * name is the ambiguous case — it decides which credential the project's
   * tooling authenticates with — and a JSON object cannot express it. The
   * harmless direction, one host variable reaching the container under two
   * names, still can.
   */
  env?: Record<string, string>;
}

/**
 * The config path for one repository, relative to the repository root, or
 * `undefined` when `repoFullName` is absent or is not a slug this layout can
 * address. A slug this cannot read is reported as "no config" rather than
 * refused: it is data Factory supplied, not something an operator wrote, and
 * refusing a session over it would blame the wrong file.
 */
function projectConfigPath(repoFullName: string | undefined): string | undefined {
  const slug = repoFullName?.trim();
  if (!slug) return undefined;

  const parts = slug.split('/');
  const [owner, name] = parts;
  // Exactly two components: the layout is `sandbox/projects/<owner>/<name>/`, so
  // a third would not name a project this can address.
  if (parts.length !== 2 || owner === undefined || name === undefined) return undefined;
  for (const part of [owner, name]) {
    if (!SLUG_COMPONENT.test(part) || part === '.' || part === '..') return undefined;
  }
  return join(PROJECT_CONFIG_ROOT, owner, name, PROJECT_CONFIG_FILE);
}

/**
 * Read and validate one project's `sandbox.json`, named by its path relative to
 * `rootDir` — which is what every message below quotes, so an operator is
 * pointed at the file they wrote rather than at a key they no longer have.
 *
 * A config this cannot read throws instead of being skipped, for the reason the
 * ceilings in `dockerSandboxOptions` refuse rather than clamp: a config that is
 * silently ignored leaves a session without the image, ceiling or credential its
 * operator wrote, and that surfaces later as a missing tool or an unauthenticated
 * CLI, far from the file that caused it. An ABSENT file is different and is not
 * an error — it is the state every project is in before anyone customizes it.
 */
function readProjectConfig(relPath: string, rootDir: string): ProjectSandboxConfig {
  let raw: string;
  try {
    raw = readFileSync(join(rootDir, relPath), 'utf8');
  } catch (error) {
    throw new Error(
      `${relPath} could not be read (${error instanceof Error ? error.message : String(error)}), so the ` +
        'sandbox configuration it holds for this project cannot be applied and this session was refused ' +
        'before a container was created.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${relPath} is not valid JSON, so the sandbox configuration it holds for this project cannot be read ` +
        'and this session was refused before a container was created. Fix the file; nothing else in the ' +
        'sandbox branch can tell a malformed config from an unconfigured project (see sandbox/README.md).',
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `${relPath} must hold a JSON object of per-project sandbox settings, and holds ` +
        `${JSON.stringify(parsed)} instead, so this session was refused before a container was created.`,
    );
  }

  const written = parsed as Record<string, unknown>;
  const config: ProjectSandboxConfig = {};

  for (const field of Object.keys(written)) {
    if (!(PROJECT_CONFIG_FIELDS as readonly string[]).includes(field)) {
      throw new Error(
        `${relPath} carries "${field}", which is not one of the fields read from it — ` +
          `${PROJECT_CONFIG_FIELDS.join(', ')} — so whatever it was meant to configure is not configured, ` +
          'and this session was refused before a container was created rather than started on a config ' +
          'that quietly ignores part of itself (see sandbox/README.md).',
      );
    }
  }

  const image = written.image;
  if (image !== undefined) {
    if (typeof image !== 'string' || !PROJECT_IMAGE.test(image)) {
      throw new Error(
        `${relPath} sets image to ${JSON.stringify(image)}, which is not a date-stamped tag in this ` +
          "repository's own factory-sandbox family, so this session was refused before a container was " +
          'created. The form is factory-sandbox-<project>:YYYY-MM-DD, built by `npm run sandbox:build -- ' +
          '<owner>/<name>`; an image from anywhere else carries no guarantee of the git and GitHub CLI ' +
          'every session needs (see sandbox/README.md).',
      );
    }
    config.image = image;
  }

  for (const field of ['memoryGib', 'cpus'] as const) {
    const value = written[field];
    if (value === undefined) continue;
    // Typed here rather than parsed from a string, which is what a JSON config
    // buys over an environment variable: `"8"` is a mistake this can name
    // instead of a value something else has to guess at.
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error(
        `${relPath} sets ${field} to ${JSON.stringify(value)}, which is not a whole number of ` +
          (field === 'memoryGib' ? 'gibibytes' : 'cores') +
          ' greater than zero, so this session was refused before a container was created. Write it as a ' +
          'JSON number — 8, not "8" — and leave it out entirely to take the global value ' +
          '(see sandbox/README.md).',
      );
    }
    config[field] = value;
  }

  const env = written.env;
  if (env !== undefined) {
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      throw new Error(
        `${relPath} sets env to ${JSON.stringify(env)}, which is not a JSON object, so this session was ` +
          'refused before a container was created. Each entry names a variable the container will have as ' +
          'its key and the host variable holding the value as that entry\'s value (see sandbox/README.md).',
      );
    }
    const forwarding: Record<string, string> = {};
    for (const [container, host] of Object.entries(env as Record<string, unknown>)) {
      if (typeof host !== 'string' || !ENV_NAME.test(container) || !ENV_NAME.test(host)) {
        throw new Error(
          `${relPath} maps the container variable ${JSON.stringify(container)} to ${JSON.stringify(host)}, ` +
            'and one of the two is not an environment variable name — letters, digits and underscores, not ' +
            'starting with a digit — so the credential this entry asks for cannot be read and this session ' +
            'was refused before a container was created. The key is the name the tooling inside the ' +
            'container reads and the value is the host variable holding it (see sandbox/README.md).',
        );
      }
      forwarding[container] = host;
    }
    config.env = forwarding;
  }

  return config;
}

// Set once the working directory has been found not to be the repository root,
// so a deployment in that state says so once instead of once per session.
let warnedAboutConfigRoot = false;

/**
 * Say once when per-project config cannot be found because the process is not
 * running with the repository root as its working directory — the cwd
 * `npm run start` is documented to keep working from, and the one
 * `ops/factory-start.sh` sets before it execs.
 *
 * Without this the failure is invisible: every project simply looks unconfigured,
 * each session runs on the global configuration, and the first sign is a CLI
 * inside a container reporting that it is not authenticated. Only the default
 * root is checked, because an explicitly supplied one is a test's.
 */
function warnIfNotRepoRoot(rootDir: string): void {
  if (warnedAboutConfigRoot) return;
  if (existsSync(join(rootDir, REPO_ROOT_MARKER))) return;

  warnedAboutConfigRoot = true;
  console.warn(
    `[factory] the working directory ${rootDir} holds no ${REPO_ROOT_MARKER}, so it is not the repository ` +
      `root and no ${PROJECT_CONFIG_ROOT}/<owner>/<name>/${PROJECT_CONFIG_FILE} can be found from here. ` +
      'Every session will run on the global sandbox configuration, and a credential a project config ' +
      'forwards will be absent inside its container with nothing else to say why. Start the server with ' +
      'the repository root as its working directory (see sandbox/README.md).',
  );
}

/**
 * The sandbox configuration for one repository, or `undefined` when it has none —
 * because the session has no repository, the slug is not one this layout can
 * address, or that project has not been customized.
 *
 * `rootDir` defaults to the working directory and is a parameter so
 * `sandbox.test.ts` can point it at a tree it wrote; production passes nothing.
 * The file is read on each call rather than cached: it happens once per new
 * session, which `MASTRACODE_MAX_SANDBOXES` bounds, and a cache would only add
 * a second answer to "which config did this container get".
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it.
 */
export function projectSandboxConfig(
  repoFullName: string | undefined,
  rootDir?: string,
): ProjectSandboxConfig | undefined {
  const relPath = projectConfigPath(repoFullName);
  if (!relPath) return undefined;

  const root = rootDir ?? process.cwd();
  if (rootDir === undefined) warnIfNotRepoRoot(root);
  if (!existsSync(join(root, relPath))) return undefined;
  return readProjectConfig(relPath, root);
}

/**
 * Host env forwarded into a Docker session container. Unlike the local
 * allow-list above, which keeps a host-run sandbox working, each entry here is
 * a credential deliberately handed to the agent: anything in the container —
 * the agent, or a repo it has cloned — can read it, so only keys scoped for
 * that belong here. `sandbox/README.md` is the record.
 *
 * Two layers reach a container. `EXPO_TOKEN` is forwarded to every session,
 * because the EAS CLI in the image is the same account whichever repository is
 * checked out. Anything else comes from `config.env` — the `env` mapping in the
 * project's own `sandbox.json`, which is per project by construction, so one
 * project's credentials never reach another project's session. That is what
 * lets several projects each carry their own Vercel token under the one name
 * their tooling reads, `VERCEL_TOKEN`, without either being visible to the
 * other.
 *
 * A project's mapping is the more specific of the two layers, so an entry whose
 * container name is `EXPO_TOKEN` replaces the global value for that project
 * rather than being refused — that is how a project on its own Expo account is
 * configured.
 *
 * Docker applies it when the container is CREATED, so a session reattaching to
 * an existing container keeps the environment it was created with.
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it.
 */
export function dockerSandboxEnv(config?: ProjectSandboxConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const expoToken = process.env.EXPO_TOKEN?.trim();
  if (expoToken) env.EXPO_TOKEN = expoToken;

  // The config lists NAMES only; the values are read here, when the container is
  // created. A named host variable that is unset or blank on this host forwards
  // nothing, so a project can be configured before its credentials are
  // provisioned. `readProjectConfig` has already refused a mapping whose shape
  // it cannot read.
  for (const [container, host] of Object.entries(config?.env ?? {})) {
    const value = process.env[host]?.trim();
    if (value) env[container] = value;
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
// The upper bound each per-container knob is held to: this host's whole sandbox
// budget, written as the product of the per-container default and the
// concurrency it was sized against so the derivation cannot drift from either.
// The two products are 30 GiB — the share of the 32 GiB VM that sandboxes get
// once Postgres has its couple — and 12 cores, which is every core the VM has.
// Two different derivations landing on two numbers `sandbox/README.md` states,
// not one whole-VM figure.
// A knob above its bound cannot be served even as the only live session, and
// nothing downstream would say so: the value is multiplied into
// `HostConfig.Memory` / a CFS quota, and Docker takes the number and fails the
// container inside the daemon instead of at the knob. Inclusive — a value equal
// to the bound is accepted.
const DOCKER_SANDBOX_MAX_MEMORY_GIB = DOCKER_SANDBOX_DEFAULT_MEMORY_GIB * DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES;
const DOCKER_SANDBOX_MAX_CPUS = DOCKER_SANDBOX_DEFAULT_CPUS * DOCKER_SANDBOX_DEFAULT_MAX_SANDBOXES;
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
 * `repoFullName` is the repository this session is for, and therefore which
 * `sandbox/projects/<owner>/<name>/sandbox.json` — if there is one — supplies
 * that project's image, ceilings and forwarded credentials. It is optional
 * because Factory only supplies it for a repo-backed session; a session without
 * one, like a project that has not been customized, takes the global value of
 * every knob and the credentials forwarded to every session, and nothing else.
 *
 * `rootDir` is where that config is looked for and defaults to the working
 * directory. It is a parameter only so `sandbox.test.ts` can point it at a tree
 * it wrote; production passes nothing.
 *
 * Exported for `sandbox.test.ts` only — nothing else imports it.
 */
export function dockerSandboxOptions(
  sessionId: string,
  repoFullName?: string,
  rootDir?: string,
): DockerSandboxOptions {
  // Read once, and shared by the image, the ceilings and the forwarded env
  // below, so one session's container is built from a single answer to "what did
  // this project ask for" rather than from three reads of one file that could
  // disagree. A config this cannot read has already refused the session.
  const project = projectSandboxConfig(repoFullName, rootDir);
  // Present exactly when `project` could be, so it is a safe label for a bound
  // refusal below that has to name the file the operator wrote.
  const configPath = projectConfigPath(repoFullName);

  // No honest default exists. `DockerSandboxOptions.image` falls back to
  // `node:22-slim`, which carries neither `git` nor `gh`, so a session started
  // on it fails at first use with Factory's `git-missing` — the exact failure
  // the purpose-built image exists to prevent. The only correct value is a tag
  // someone built on this host, so refuse and name the key. The slot is called
  // per session, so this surfaces at the first session rather than at boot.
  //
  // A project's own image wins over the global key. Its form is pinned where the
  // config is read rather than here, exactly as the global key's form is pinned
  // in `.env.schema`, so this check stays the one thing a package default could
  // sneak past — blank.
  const image = project?.image || process.env.FACTORY_SANDBOX_IMAGE?.trim();
  if (!image) {
    throw new Error(
      'FACTORY_SANDBOX_IMAGE is required when the docker sandbox provider is selected. Set it to an image ' +
        'built on this host that carries git and the GitHub CLI (see sandbox/README.md); there is no safe default.',
    );
  }

  // A project ceiling that was not a whole number was refused where the config
  // was read — a JSON number has no "reads as a number but is not digits" case
  // for a string value to hide in — so what reaches here is either a number the
  // project asked for or nothing, and nothing means the global key decides, the
  // same fallback the global key gets when it is unreadable.
  // `memorySource`/`cpusSource` record which of the two the resolved number came
  // from, so the bound refusal below names the file or the key to edit.
  const memorySource = project?.memoryGib === undefined ? 'FACTORY_SANDBOX_MEMORY_GIB' : `${configPath} memoryGib`;
  const memoryGib =
    project?.memoryGib ?? positiveInt(process.env.FACTORY_SANDBOX_MEMORY_GIB) ?? DOCKER_SANDBOX_DEFAULT_MEMORY_GIB;

  const cpusSource = project?.cpus === undefined ? 'FACTORY_SANDBOX_CPUS' : `${configPath} cpus`;
  const cpus = project?.cpus ?? positiveInt(process.env.FACTORY_SANDBOX_CPUS) ?? DOCKER_SANDBOX_DEFAULT_CPUS;

  // Refuse a knob raised past what this host can serve, before it is multiplied
  // into a byte count or a CFS quota. Clamping to the bound or falling back to
  // the default would both hide the mistake — a `.env` asking for 64 GiB would
  // quietly get 30 or 10 — while Docker accepts any number it is handed and
  // fails the container inside the daemon, far from the key that caused it. So
  // this throws and names the key, exactly as the missing image above does, and
  // for the same reason: leaving the docker branch by throwing is what keeps a
  // refusal from falling through to the Platform or E2B arms in `selectSandbox`.
  // The bound is the same for a project's own ceiling as for the global one: it
  // is what this host can give one container, whichever of the two asked.
  if (memoryGib > DOCKER_SANDBOX_MAX_MEMORY_GIB) {
    throw new Error(
      `${memorySource} is ${memoryGib}, which is more than the ${DOCKER_SANDBOX_MAX_MEMORY_GIB} GiB ` +
        'this host can give one session container, so this session was refused before a container was created. ' +
        'Lower it to that number or below; the bound itself is not a setting — sandbox/README.md says what ' +
        'raising it takes.',
    );
  }
  if (cpus > DOCKER_SANDBOX_MAX_CPUS) {
    throw new Error(
      `${cpusSource} is ${cpus}, which is more than the ${DOCKER_SANDBOX_MAX_CPUS} cores this host can ` +
        'give one session container, so this session was refused before a container was created. Lower it to ' +
        'that number or below; the bound itself is not a setting — sandbox/README.md says what raising it takes.',
    );
  }

  const memoryBytes = memoryGib * BYTES_PER_GIB;
  const env = dockerSandboxEnv(project);

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
    // Omitted rather than `{}` when nothing is forwarded, so an unset key
    // leaves the options exactly as they were before forwarding existed.
    ...(Object.keys(env).length > 0 ? { env } : {}),
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
    //
    // `ctx.repoFullName` is what decides which project's own config under
    // `sandbox/projects/` supplies this session's image, ceilings and forwarded
    // credentials, rather than every session's: Factory sets it from the
    // repository the session is bound to, and leaves it undefined for one that
    // has no repository, which then takes the global value of every knob.
    const options = dockerSandboxOptions(ctx.sessionId, ctx.repoFullName);
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
