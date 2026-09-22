/**
 * Tests for the entry's pure helpers and for `selectSandbox` and `selectAuth`,
 * which are neither pure nor helpers — they read the environment and construct
 * a provider — but whose branch ORDER is the one thing in this file that no
 * other check in the repository can see.
 *
 * These run inside the verify gate (`.bmad-loop/policy.toml` `[verify].commands`),
 * so a change that breaks environment parsing fails there rather than at boot,
 * where the only witness is a crash-looping supervisor.
 *
 * The helpers are imported from the entry itself, which boots the factory at
 * module load (top-level `await factory.prepare()` / `finalize()`). That boot
 * reads deployment env, so anything inherited from the operator's shell would
 * configure it: `REDIS_URL` makes it dial a Redis that need not exist (the gate
 * hangs rather than fails), and a malformed `FACTORY_CREDENTIAL_ENCRYPTION_KEY`
 * aborts the import before a single test runs. The preamble therefore sweeps
 * away every variable the entry consults and sets only what the boot needs.
 * The sweep is mostly by prefix, so an env var added to the entry under one of
 * the prefixes below is neutralized without anyone remembering to update this
 * file. The unprefixed names are listed exactly in ENTRY_ENV_EXACT below and do
 * have to be kept in step with the entry by hand.
 * Static `import` statements are evaluated before any module body statement, so
 * the entry is pulled in with `await import(...)` once that is arranged.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
// Type-only, so it is erased before the sweep below matters: a static VALUE
// import would run ahead of it and let an inherited variable configure the boot.
import type { MastraSandbox } from '@mastra/core/workspace';

// Every env var the entry reads starts with one of these, or is named exactly
// below. Sweeping the whole space keeps an inherited value from configuring the
// boot; PATH/HOME and the rest of the shell are untouched.
const ENTRY_ENV_PREFIXES = [
  'FACTORY_',
  'MASTRA_',
  'MASTRACODE_',
  'WORKOS_',
  'GITHUB_APP_',
  'LINEAR_',
  'SLACK_APP_',
  'E2B_',
];
// DOCKER_HOST is swept even though the entry never reads it: the docker tests
// below construct a real `DockerSandbox`, whose `new Docker()` makes
// docker-modem read DOCKER_HOST itself and throw on a value it cannot parse.
// Inherited from an operator's shell, that would fail the verify gate for a
// reason having nothing to do with the code under test.
// BETTER_AUTH_SECRET matches none of the prefixes above and IS read by the
// entry: inherited from a shell it would make the boot below construct a real
// self-managed auth provider, so `selectAuth`'s fall-through cases would see a
// configured deployment and the entry's own boot would install a provider the
// gate never intended.
const ENTRY_ENV_EXACT = ['REDIS_URL', 'DATABASE_URL', 'APP_DATABASE_URL', 'DOCKER_HOST', 'BETTER_AUTH_SECRET'];

for (const key of Object.keys(process.env)) {
  if (ENTRY_ENV_PREFIXES.some(prefix => key.startsWith(prefix)) || ENTRY_ENV_EXACT.includes(key)) {
    delete process.env[key];
  }
}

// Set after the sweep — `MASTRA_DB_PATH` starts with a swept prefix.
//
// `NODE_ENV` is assigned unconditionally: inheriting `production` would make
// the entry throw on the `DATABASE_URL` just swept away, failing the gate for a
// reason unrelated to the helpers. With no `DATABASE_URL` the entry falls back
// to local libSQL at `getDatabasePath()`, which defaults to the operator's real
// dev database (`~/Library/Application Support/mastracode/mastra.db`) — booting
// there would migrate and run workers against live data, so redirect it at a
// throwaway file first.
process.env.NODE_ENV = 'test';
// Unique per run, not per pid: pids are recycled, and reopening an earlier
// run's file would migrate a stale schema instead of starting clean.
const dbPath = join(tmpdir(), `mastra-factory-index-test-${randomUUID()}.db`);
process.env.MASTRA_DB_PATH = dbPath;
// The `selectAuth` block boots a SECOND instance of the entry, with
// BETTER_AUTH_SECRET set, to observe that the entry wires its provider into the
// factory. That boot gets its own file so it cannot migrate or lock the one
// above.
const selfManagedDbPath = join(tmpdir(), `mastra-factory-index-test-auth-${randomUUID()}.db`);

// libSQL leaves `.db`, `.db-wal` and `.db-shm` behind — about 1.8 MB per run.
// `npm test` is a verify-gate command, so without this they accumulate in the
// temp directory of every machine that ever runs the gate.
afterAll(() => {
  for (const path of [dbPath, selfManagedDbPath]) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
  }
});

const {
  LOCAL_SANDBOX_ENV_KEYS,
  decodeCredentialEncryptionKey,
  dockerSandboxOptions,
  liveDockerSandboxes,
  localSandboxEnv,
  positiveInt,
  selectAuth,
  selectSandbox,
} = await import('./index');
// Deferred for the same reason as the entry: a static import runs before the
// sweep above, and constructing a Docker client reads DOCKER_HOST.
const { DockerSandbox } = await import('@mastra/docker');
// Deferred for symmetry with the entry's own import order; the provider package
// reads no environment of its own.
const { MastraAuthBetterAuth } = await import('@mastra/auth-better-auth');

describe('the boot this file performs', () => {
  it("runs against the throwaway database, not the operator's", () => {
    // Nothing else in this file observes the redirect, so deleting the
    // `MASTRA_DB_PATH` assignment above — it reads like scaffolding — would
    // leave every other test green while the import migrates and starts
    // workers against `~/Library/Application Support/mastracode/mastra.db`.
    expect(process.env.MASTRA_DB_PATH).toBe(dbPath);
    expect(existsSync(dbPath)).toBe(true);
  });
});

/**
 * The allow-list the entry forwards into a `LocalSandbox`, restated here rather
 * than derived from the real constant. What the restatement buys is that the
 * list below is what a reviewer reads: the behavioural tests assert against
 * these literals, so changing the entry's list without changing this one is a
 * test failure. It does NOT by itself catch a key being *added* — an added key
 * that happens to be unset in this process is skipped by the helper's `if
 * (value)` guard — which is why the two lists are also compared directly, so an
 * allow-list that grows a secret-bearing variable turns the gate red.
 * `PATH` is deliberately absent: core's `LocalSandbox` adds it itself, so the
 * helper must not.
 */
const FORWARDED_KEYS = [
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
];

/** Values that must never reach a command run against an untrusted checkout. */
const WITHHELD_KEYS = [
  'PATH',
  'DATABASE_URL',
  'GITHUB_APP_PRIVATE_KEY',
  'WORKOS_API_KEY',
  'FACTORY_CREDENTIAL_ENCRYPTION_KEY',
  'SLACK_APP_SIGNING_SECRET',
];

describe('positiveInt', () => {
  it('returns undefined for an unset or empty value', () => {
    expect(positiveInt(undefined)).toBeUndefined();
    expect(positiveInt('')).toBeUndefined();
  });

  it('returns undefined for non-positive values', () => {
    expect(positiveInt('0')).toBeUndefined();
    expect(positiveInt('-1')).toBeUndefined();
  });

  it('returns undefined for unparseable values', () => {
    expect(positiveInt('abc')).toBeUndefined();
    expect(positiveInt('4 workers')).toBeUndefined();
    expect(positiveInt('NaN')).toBeUndefined();
  });

  it('rejects fractional values rather than flooring them', () => {
    // Flooring `0.5` to `0` would silently disable a capacity knob.
    expect(positiveInt('0.5')).toBeUndefined();
    expect(positiveInt('2.5')).toBeUndefined();
  });

  it('returns undefined for values beyond the safe-integer range', () => {
    expect(positiveInt('9007199254740993')).toBeUndefined();
    expect(positiveInt('Infinity')).toBeUndefined();
  });

  it('returns the parsed number for a positive integer', () => {
    expect(positiveInt('3')).toBe(3);
    expect(positiveInt('1')).toBe(1);
  });

  it('accepts the alternative spellings `Number` understands, so a typo can become a valid knob', () => {
    // Pins today's behaviour rather than endorsing it. These are the dangerous
    // malformed inputs: each yields a different valid number instead of
    // `undefined`, so a typo'd knob silently takes effect rather than falling
    // back to the default. Changing this is out of the story's scope; the test
    // makes any such change a visible edit here.
    expect(positiveInt('0x10')).toBe(16);
    expect(positiveInt('0b11')).toBe(3);
    expect(positiveInt('1e3')).toBe(1000);
    expect(positiveInt('+5')).toBe(5);
    expect(positiveInt(' 3 ')).toBe(3);
  });
});

describe('decodeCredentialEncryptionKey', () => {
  const validKey = Buffer.alloc(32, 7).toString('base64');

  it('decodes a well-formed base64 32-byte key', () => {
    const decoded = decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', validKey);
    expect(Buffer.isBuffer(decoded)).toBe(true);
    expect(decoded.byteLength).toBe(32);
    expect(decoded.equals(Buffer.alloc(32, 7))).toBe(true);
  });

  it('names the environment variable when a non-base64 value decodes to the wrong length', () => {
    // `Buffer.from` does not reject this; it skips the invalid characters and
    // yields 10 bytes, so this fails on length — the only check there is.
    expect(Buffer.from('not-a-real-key', 'base64').byteLength).toBe(10);
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', 'not-a-real-key')).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('accepts a value containing non-base64 characters when the rest still decodes to 32 bytes', () => {
    // Pins today's behaviour rather than endorsing it: the helper validates
    // byte length only, so `Buffer.from`'s lenient decoding lets a value with
    // garbage in it through. Changing that is out of this story's scope; this
    // test exists so the change is a visible, deliberate edit here.
    const lenient = `!!!!${'A'.repeat(43)}`;
    const decoded = decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', lenient);
    expect(decoded.byteLength).toBe(32);
  });

  it('names the environment variable when the key is the wrong length', () => {
    const tooShort = Buffer.alloc(31, 7).toString('base64');
    const tooLong = Buffer.alloc(33, 7).toString('base64');
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', tooShort)).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', tooLong)).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('names the environment variable when the value is empty', () => {
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', '')).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('carries whichever variable name it was given, so a rotation failure points at the right key', () => {
    // The previous-keys group decodes through the same helper; a failure there
    // must not accuse the primary key.
    expect(() =>
      decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS', 'not-a-real-key'),
    ).toThrow(/FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS/);
  });
});

describe('localSandboxEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards exactly the allow-list this file states, so a key added to the entry fails here', () => {
    // The behavioural tests below cannot see an added key that is unset in this
    // process, so the allow-list itself is pinned.
    expect([...LOCAL_SANDBOX_ENV_KEYS]).toEqual(FORWARDED_KEYS);
  });

  it('forwards every allow-listed variable that is set, and nothing else', () => {
    for (const key of FORWARDED_KEYS) vi.stubEnv(key, `value-of-${key}`);
    for (const key of WITHHELD_KEYS) vi.stubEnv(key, `secret-${key}`);

    const env = localSandboxEnv();

    expect(Object.keys(env).sort()).toEqual([...FORWARDED_KEYS].sort());
    for (const key of FORWARDED_KEYS) expect(env[key]).toBe(`value-of-${key}`);
    for (const key of WITHHELD_KEYS) expect(env).not.toHaveProperty(key);
  });

  it('omits allow-listed variables that are unset or empty', () => {
    for (const key of FORWARDED_KEYS) vi.stubEnv(key, undefined);
    vi.stubEnv('HOME', '/home/agent');
    vi.stubEnv('TZ', 'UTC');
    vi.stubEnv('TERM', ''); // set but empty — still not forwarded
    vi.stubEnv('DATABASE_URL', 'postgres://secret');

    expect(localSandboxEnv()).toEqual({ HOME: '/home/agent', TZ: 'UTC' });
  });

  it('returns an empty record when nothing allow-listed is set', () => {
    for (const key of FORWARDED_KEYS) vi.stubEnv(key, undefined);
    vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'secret');

    expect(localSandboxEnv()).toEqual({});
  });
});

/**
 * The ceilings handed to a session's Docker container. Nothing else in this
 * repository can observe a `DockerSandboxOptions` — the entry hands it straight
 * to the constructor, and no container is ever created in the verify gate — so
 * these assertions are the only place a quota computed against the wrong period,
 * or a memory limit passed in gibibytes where Docker wants bytes, is visible.
 * The numbers are written out as literals rather than recomputed from the
 * entry's constants: a test that repeats the production arithmetic agrees with
 * whatever that arithmetic becomes.
 */
describe('dockerSandboxOptions', () => {
  const IMAGE = 'factory-sandbox:2026-09-23';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('carries the session id, the configured image and every documented default', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', undefined);
    vi.stubEnv('FACTORY_SANDBOX_CPUS', undefined);
    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', undefined);

    expect(dockerSandboxOptions('session-abc')).toEqual({
      id: 'session-abc',
      image: IMAGE,
      memory: 10 * 1024 * 1024 * 1024,
      // Equal to `memory`. Omitted, Docker would allow another 10 GiB of swap
      // on top, so the documented cap would be half the real ceiling.
      memorySwap: 10 * 1024 * 1024 * 1024,
      cpuPeriod: 100_000,
      cpuQuota: 400_000,
      pidsLimit: 4096,
      // Pinned, not inherited: Docker's own `--init` is off by default and the
      // package's `init` default is what turns it on, so leaving it out would
      // make the zombie reaping `pidsLimit` relies on a package default a minor
      // upgrade could flip with nothing here noticing.
      init: true,
      timeout: 900_000,
      workingDirectory: '/workspace',
    });
  });

  it('uses `workingDirectory`, never the package\'s deprecated `workingDir` alias', () => {
    // Both exist on DockerSandboxOptions and `workingDirectory` wins when both
    // are set, so passing the deprecated one would work until it is removed.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);

    const options = dockerSandboxOptions('session-abc');

    expect(options).toHaveProperty('workingDirectory');
    expect(options).not.toHaveProperty('workingDir');

    // The property check above only sees the object. The constructor is what
    // resolves option, deprecated alias and built-in default into one value, so
    // read the getter it narrows to `string` and confirm ours is what won.
    expect(new DockerSandbox(options).workingDirectory).toBe('/workspace');
  });

  it('passes no dockerOptions, leaving dockerode to read DOCKER_HOST itself', () => {
    // ops/README.md owns DOCKER_HOST; re-reading it here would be a second
    // source of truth that silently disagrees with the documented one.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);

    expect(dockerSandboxOptions('session-abc')).not.toHaveProperty('dockerOptions');
  });

  it('derives the CPU quota from the pinned period, so the number means whole cores', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '2');

    const options = dockerSandboxOptions('session-abc');

    expect(options.cpuPeriod).toBe(100_000);
    expect(options.cpuQuota).toBe(200_000);
  });

  it('converts the memory ceiling from gibibytes to the bytes Docker expects', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '4');

    // Not 4 — HostConfig.Memory is in bytes, and 4 bytes is not a memory limit
    // any container can start under.
    expect(dockerSandboxOptions('session-abc').memory).toBe(4294967296);
  });

  it('trims the image, so a padded .env value still names a real tag', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', `  ${IMAGE}  `);

    expect(dockerSandboxOptions('session-abc').image).toBe(IMAGE);
  });

  it('refuses rather than falling back when the image is unset or blank', () => {
    // The package default is `node:22-slim`, which carries neither git nor gh:
    // defaulting would trade a named boot-time error for a `git-missing`
    // failure after a session has already started.
    for (const value of [undefined, '', '   ']) {
      vi.stubEnv('FACTORY_SANDBOX_IMAGE', value);
      expect(() => dockerSandboxOptions('session-abc')).toThrow(/FACTORY_SANDBOX_IMAGE/);
    }
  });

  it('falls back to the documented defaults for malformed or non-positive ceilings', () => {
    for (const bad of ['abc', '0', '-2', '2.5', '']) {
      vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
      vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', bad);
      vi.stubEnv('FACTORY_SANDBOX_CPUS', bad);

      const options = dockerSandboxOptions('session-abc');

      expect(options.memory).toBe(10 * 1024 * 1024 * 1024);
      expect(options.cpuQuota).toBe(400_000);
    }
  });

  it('honours positive whole-number ceilings', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '16');
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '8');

    const options = dockerSandboxOptions('session-abc');

    expect(options.memory).toBe(16 * 1024 * 1024 * 1024);
    expect(options.cpuQuota).toBe(800_000);
  });

  it('falls back to /workspace for a blank or unset workdir, and trims a set one', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', undefined);
    expect(dockerSandboxOptions('session-abc').workingDirectory).toBe('/workspace');

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', '');
    expect(dockerSandboxOptions('session-abc').workingDirectory).toBe('/workspace');

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', '   ');
    expect(dockerSandboxOptions('session-abc').workingDirectory).toBe('/workspace');

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', ' /srv/checkouts ');
    expect(dockerSandboxOptions('session-abc').workingDirectory).toBe('/srv/checkouts');
  });

  it('keys the sandbox on the session id, so a reconnect reattaches instead of provisioning a second container', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);

    expect(dockerSandboxOptions('session-one').id).toBe('session-one');
    expect(dockerSandboxOptions('session-two').id).toBe('session-two');
  });
});

/**
 * Which provider a session gets, and — the whole point of the Docker branch —
 * in what ORDER the candidates are considered. Nothing else in this repository
 * can see that order: reordering the branches leaves `tsc` clean and every
 * other test green, while quietly handing agent work to a cloud VM whenever a
 * platform variable is left behind in `.env`.
 *
 * `platformSandboxConfigured` is the entry's module-level platform-env check,
 * passed in, so both arms are reachable from a test that swept the environment
 * before importing the entry.
 */
describe('selectSandbox', () => {
  const IMAGE = 'factory-sandbox:2026-09-23';
  const ctx = {
    sessionId: 'session-abc',
    repoFullName: undefined,
    setupCommand: undefined,
    getRepositoryAccess: undefined,
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a Docker sandbox for the `docker` provider', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);

    const sandbox = selectSandbox(ctx, false);

    expect(sandbox.name).toBe('DockerSandbox');
    expect(sandbox.id).toBe('session-abc');
  });

  it('prefers Docker over the platform and E2B providers, so a stray cloud variable cannot relocate a session', () => {
    // The story's whole claim. With the branch order reversed this returns a
    // PlatformSandbox — or throws on the absent platform credentials — instead.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(selectSandbox(ctx, true).name).toBe('DockerSandbox');
  });

  it('refuses the session rather than falling through when the image is unset', () => {
    // The refusal has to be observable HERE, not only against
    // `dockerSandboxOptions` in isolation. Making the docker branch conditional
    // on a resolvable image — or wrapping it in a try/catch — would leave every
    // other test in this file green while silently restoring the off-host
    // fall-through this story exists to remove, so the platform and E2B
    // variables are set to make that fall-through visible if it returns.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', undefined);
    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(() => selectSandbox(ctx, true)).toThrow(/FACTORY_SANDBOX_IMAGE/);
  });

  it('trims the provider value, so a padded .env line still selects Docker', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', '  docker  ');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);

    expect(selectSandbox(ctx, false).name).toBe('DockerSandbox');
  });

  it('falls through to the existing chain for an unrecognised provider rather than throwing', () => {
    // NFR23: `DOCKER`, `podman` and a typo are not selections. Each must leave
    // the pre-existing Platform → E2B → local chain exactly as it was.
    for (const value of [undefined, '', 'DOCKER', 'podman', 'dockr']) {
      vi.stubEnv('FACTORY_SANDBOX_PROVIDER', value);
      vi.stubEnv('E2B_API_KEY', 'e2b-key');
      expect(selectSandbox(ctx, false).name).toBe('E2BSandbox');

      vi.stubEnv('E2B_API_KEY', undefined);
      expect(selectSandbox(ctx, false).name).toBe('LocalSandbox');
    }
  });

  it('still pins the local sandbox on the exact string `local`', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'local');
    vi.stubEnv('E2B_API_KEY', 'e2b-key');

    // `local` beats a configured platform and a configured E2B, as before.
    expect(selectSandbox(ctx, true).name).toBe('LocalSandbox');
  });
});

/**
 * The concurrent-session cap. Nothing in the installed packages enforces one —
 * `@mastra/factory` removed `maxSandboxes` with the sandbox fleet, and its
 * session registry constructs unconditionally — so this behaviour exists only in
 * the entry, and `tsc` cannot see a capacity rule. No container is ever created
 * in the verify gate either, which leaves these assertions as the only automated
 * witness that a fourth concurrent session is refused rather than handed its own
 * 10 GiB ceiling on a host sized for three.
 *
 * All but the last test drive their own `Map`, injected as `selectSandbox`'s
 * third argument, so no test can leak occupancy into the next one. That
 * injection cannot see which map the production call site binds to, though —
 * `sandbox: ctx => selectSandbox(ctx, hasPlatformSandboxEnv)` passes two
 * arguments and takes the default — so the last test deliberately drives the
 * shared `liveDockerSandboxes`, clearing it first because
 * `describe('selectSandbox')` above already registered a session in it.
 */
describe('selectSandbox concurrent-session cap', () => {
  const IMAGE = 'factory-sandbox:2026-09-23';
  const ctxFor = (sessionId: string) => ({
    sessionId,
    repoFullName: undefined,
    setupCommand: undefined,
    getRepositoryAccess: undefined,
  });

  /** A fresh registry filled by admitting `count` distinct sessions. */
  function registryWith(count: number) {
    const live = new Map<string, MastraSandbox>();
    for (let i = 0; i < count; i += 1) selectSandbox(ctxFor(`session-${i}`), false, live);
    expect(live.size).toBe(count);
    return live;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits the first session and registers it under its session id', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = new Map<string, MastraSandbox>();

    const sandbox = selectSandbox(ctxFor('session-0'), false, live);

    expect(sandbox.name).toBe('DockerSandbox');
    // Registered under the SAME key the reattach check looks up: registering by
    // anything else leaves every resumed session claiming a fresh slot.
    expect(live.get('session-0')).toBe(sandbox);
  });

  it('refuses the fourth distinct session at the documented default, naming the key and the number', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = registryWith(3);

    // The operator sees only this message, so both halves are pinned: the key
    // to change, and the value it currently has.
    expect(() => selectSandbox(ctxFor('session-3'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES/);
    expect(() => selectSandbox(ctxFor('session-3'), false, live)).toThrow(/\b3\b/);
    // A refused session must not be registered — otherwise a retry loop would
    // fill the registry with sessions that have no container.
    expect(live.size).toBe(3);
    expect(live.has('session-3')).toBe(false);
  });

  it('admits exactly the cap before refusing', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = new Map<string, MastraSandbox>();

    // An off-by-one here is the difference between a host sized for three
    // running two and one running four.
    for (const id of ['a', 'b', 'c']) expect(selectSandbox(ctxFor(id), false, live).name).toBe('DockerSandbox');
    expect(() => selectSandbox(ctxFor('d'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES/);
  });

  it('honours a raised cap', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('MASTRACODE_MAX_SANDBOXES', '5');
    const live = registryWith(4);

    expect(selectSandbox(ctxFor('session-4'), false, live).name).toBe('DockerSandbox');
    expect(() => selectSandbox(ctxFor('session-5'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES is 5/);
  });

  it('admits a reattaching session at the cap without consuming another slot', () => {
    // A resumed session is the case that must never be refused: Factory only
    // calls this slot again for a session whose sandbox it no longer has
    // memoized, and the container is already out there under the same id.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = registryWith(3);

    expect(selectSandbox(ctxFor('session-1'), false, live).name).toBe('DockerSandbox');
    expect(live.size).toBe(3);
  });

  it('frees the slot of a session Factory has stopped or destroyed', () => {
    // `stop()`/`destroy()` on the instance this slot returned are the whole
    // release path — there is no eviction hook and no timer.
    for (const released of ['stopped', 'destroyed'] as const) {
      vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
      vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
      const live = registryWith(3);

      const retired = live.get('session-0');
      if (!retired) throw new Error('expected session-0 to be registered');
      retired.status = released;

      expect(selectSandbox(ctxFor('session-3'), false, live).name).toBe('DockerSandbox');
      expect(live.size).toBe(3);
      expect(live.has('session-0')).toBe(false);
    }
  });

  it('keeps the slot of a session whose start failed', () => {
    // `error` is set when the start lifecycle throws, and session setup (clone,
    // checkout, setup command) runs after the container is created and started
    // — so an errored sandbox usually still owns a container. Freeing its slot
    // would overcommit the host precisely when something is already wrong.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = registryWith(3);

    const failed = live.get('session-0');
    if (!failed) throw new Error('expected session-0 to be registered');
    failed.status = 'error';

    expect(() => selectSandbox(ctxFor('session-3'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES/);
    expect(live.has('session-0')).toBe(true);
  });

  it('falls back to the default of 3 for malformed or non-positive values', () => {
    // Same fall-back as the sibling ceilings: `0` is not "disabled", it is
    // malformed. There is no value that turns the cap off.
    for (const bad of ['0', '-1', '2.5', 'abc', '', '   ']) {
      vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
      vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
      vi.stubEnv('MASTRACODE_MAX_SANDBOXES', bad);
      const live = registryWith(3);

      expect(() => selectSandbox(ctxFor('session-3'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES is 3/);
    }
  });

  it('reports the missing image ahead of the cap', () => {
    // An unset image breaks every session on this deployment; the cap refuses
    // only this one. The more general cause is the one worth naming.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = registryWith(3);

    vi.stubEnv('FACTORY_SANDBOX_IMAGE', undefined);
    expect(() => selectSandbox(ctxFor('session-3'), false, live)).toThrow(/FACTORY_SANDBOX_IMAGE/);
  });

  it('refuses rather than relocating the session to a configured cloud provider', () => {
    // NFR12. A cap that falls through is not a cap: it moves the work to a
    // third party's VM, which is the single thing this deployment's sandbox
    // configuration exists to prevent. Setting every cloud variable makes that
    // fall-through visible here if the refusal ever becomes a `return`.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    const live = registryWith(3);

    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(() => selectSandbox(ctxFor('session-3'), true, live)).toThrow(/MASTRACODE_MAX_SANDBOXES/);
  });

  it('caps only the docker provider, leaving the others untouched', () => {
    // The number is sized from this host's memory against
    // FACTORY_SANDBOX_MEMORY_GIB, which no other provider reads — a cloud VM or
    // a `local` run is not competing for it.
    vi.stubEnv('MASTRACODE_MAX_SANDBOXES', '1');
    const live = new Map<string, MastraSandbox>();

    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'local');
    for (const id of ['a', 'b', 'c', 'd']) expect(selectSandbox(ctxFor(id), true, live).name).toBe('LocalSandbox');

    // `PlatformSandbox` builds a real platform client at construction, which
    // reads these itself and throws without them — the same group that makes
    // `platformSandboxConfigured` true in the entry. Inert test values.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', undefined);
    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    for (const id of ['e', 'f', 'g', 'h']) expect(selectSandbox(ctxFor(id), true, live).name).toBe('PlatformSandbox');

    vi.stubEnv('E2B_API_KEY', 'e2b-key');
    for (const id of ['i', 'j', 'k', 'l']) expect(selectSandbox(ctxFor(id), false, live).name).toBe('E2BSandbox');

    expect(live.size).toBe(0);
  });

  it('caps the module-level registry the production call site actually binds to', () => {
    // Every test above injects its own map, which cannot distinguish the real
    // default from `= new Map()` — a change that disables the cap in production
    // while leaving `tsc` and all of them green. This one takes the default by
    // passing only two arguments, exactly as
    // `sandbox: ctx => selectSandbox(ctx, hasPlatformSandboxEnv)` does.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    // `describe('selectSandbox')` above already registered `session-abc` here.
    liveDockerSandboxes.clear();

    for (const id of ['shared-0', 'shared-1', 'shared-2']) {
      expect(selectSandbox(ctxFor(id), false).name).toBe('DockerSandbox');
    }
    expect(() => selectSandbox(ctxFor('shared-3'), false)).toThrow(/MASTRACODE_MAX_SANDBOXES/);

    // Leave nothing behind for whatever runs next in this process.
    liveDockerSandboxes.clear();
  });
});

/**
 * Which identity provider this deployment runs on, and — the whole point of
 * the story — in what ORDER the candidates are considered. Nothing else in the
 * repository can see that order: reordering the arms leaves `tsc` clean and
 * every other test green while either handing identity to a third party that a
 * stray MASTRA_SHARED_API_URL names, or overriding an operator's deliberate
 * platform deferral.
 *
 * The other thing asserted here is that a blank secret never reaches the
 * constructor. `new MastraAuthBetterAuth({})` throws at module load, so a
 * regression there is not a failed sign-in — it is a deployment that will not
 * boot, with an error message naming a missing `auth` instance rather than the
 * unset key the operator actually forgot.
 */
describe('selectAuth', () => {
  // Length is what a real deployment would use; the value is inert test data.
  const SECRET = 'x'.repeat(48);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('builds a self-managed provider from BETTER_AUTH_SECRET alone', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);

    const provider = selectAuth();

    expect(provider).toBeInstanceOf(MastraAuthBetterAuth);
    if (!(provider instanceof MastraAuthBetterAuth)) throw new Error('expected a MastraAuthBetterAuth');
    // The SPA renders its email/password form only for the literal
    // `better-auth`, so a `name:` override here would leave a configured
    // deployment with no way to sign in.
    expect(provider.name).toBe('better-auth');
  });

  it('closes registration: a self-managed provider never allows sign-up', () => {
    // If this fails, registration reopened — most likely because the explicit
    // `signUpEnabled: false` was deleted from the constructor options and the
    // package default (`options.signUpEnabled ?? true`) took over, which is a
    // diff that mentions sign-up nowhere.
    //
    // One field, three readers, so this single assertion covers all of them:
    // `init()` passes `disableSignUp: !signUpEnabledConfig` into better-auth,
    // which is what makes POST /auth/api/sign-up/email answer 400
    // EMAIL_PASSWORD_SIGN_UP_DISABLED; `/auth/me` turns it into the SPA's
    // `signUpDisabled`, which removes the "New here? Sign up" toggle; and
    // `buildCapabilities` reads it for Studio's login.
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);

    const provider = selectAuth();

    expect(provider).toBeInstanceOf(MastraAuthBetterAuth);
    if (!(provider instanceof MastraAuthBetterAuth)) throw new Error('expected a MastraAuthBetterAuth');
    expect(provider.isSignUpEnabled()).toBe(false);
  });

  it('trims the secret, so a padded .env line still selects self-managed auth', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', `  ${SECRET}  `);

    const provider = selectAuth();

    expect(provider).toBeInstanceOf(MastraAuthBetterAuth);
    // Padding changes which value reaches the constructor, so this asserts it
    // reaches the SAME provider — registration included, not just the class.
    if (!(provider instanceof MastraAuthBetterAuth)) throw new Error('expected a MastraAuthBetterAuth');
    expect(provider.isSignUpEnabled()).toBe(false);
  });

  it('falls through without throwing when the secret is unset, empty or whitespace', () => {
    // The constructor throws when neither an instance nor a secret is given,
    // and this runs at module load — so a regression that passes the raw value
    // through takes the whole deployment down at boot instead of leaving the
    // provider unconfigured.
    for (const value of [undefined, '', '   ']) {
      vi.stubEnv('BETTER_AUTH_SECRET', value);
      expect(selectAuth()).toBeUndefined();
    }
  });

  it('lets MASTRA_SHARED_API_URL win over a configured secret, and says so', () => {
    // The story's ordering claim. With the arms swapped this returns a
    // provider instead, and a deployment that deliberately deferred identity
    // to the platform silently starts minting its own sessions.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('MASTRA_SHARED_API_URL', 'https://platform.example/v1');
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);

    expect(selectAuth()).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/BETTER_AUTH_SECRET/);
  });

  it('stays silent when the platform URL is set and no self-managed secret is', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('MASTRA_SHARED_API_URL', 'https://platform.example/v1');
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);

    expect(selectAuth()).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not let a blank MASTRA_SHARED_API_URL override a configured secret', () => {
    // The platform URL is trimmed for the same reason the secret is: a
    // `MASTRA_SHARED_API_URL=` line left with trailing spaces in .env is an
    // unset var, not a deferral. Without the trim this deployment would hand
    // identity to the platform-backed default provider and downgrade its own
    // configured secret to a warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);

    for (const value of ['', '   ']) {
      vi.stubEnv('MASTRA_SHARED_API_URL', value);
      expect(selectAuth()).toBeInstanceOf(MastraAuthBetterAuth);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns null for MASTRACODE_AUTH_DISABLED=1 whatever else is configured', () => {
    // `null` is distinct from `undefined` at the call site: it is the only
    // value that also drops credential encryption.
    vi.stubEnv('MASTRACODE_AUTH_DISABLED', '1');
    vi.stubEnv('MASTRA_SHARED_API_URL', 'https://platform.example/v1');
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
    vi.stubEnv('WORKOS_API_KEY', 'residual-key');
    vi.stubEnv('WORKOS_CLIENT_ID', 'residual-client');

    expect(selectAuth()).toBeNull();
  });

  it('only treats the exact string `1` as the opt-out', () => {
    for (const value of ['0', 'true', '', ' 1 ', undefined]) {
      vi.stubEnv('MASTRACODE_AUTH_DISABLED', value);
      expect(selectAuth()).toBeUndefined();
    }
  });

  it('ignores a residual WORKOS_* pair, which no longer selects anything', () => {
    // These keys stay declared because WORKOS_COOKIE_PASSWORD still feeds the
    // OAuth-state signer; the credential pair no longer wires a provider.
    vi.stubEnv('WORKOS_API_KEY', 'residual-key');
    vi.stubEnv('WORKOS_CLIENT_ID', 'residual-client');
    vi.stubEnv('WORKOS_COOKIE_PASSWORD', 'residual-password');

    expect(selectAuth()).toBeUndefined();
  });

  it('returns undefined when nothing is configured', () => {
    expect(selectAuth()).toBeUndefined();
  });

  it('is what the entry actually hands to MastraFactory', async () => {
    // Everything above tests the function in isolation, so severing the module
    // -level `const auth = selectAuth()` — replacing it with `undefined` —
    // leaves `tsc` clean and all of it green while the deployment silently
    // reverts to platform-hosted identity. The only witness is the route the
    // factory derives from the provider it was actually given: an
    // `IAuthHttpHandler` (which the platform-backed default is not) is what
    // makes it mount better-auth's own HTTP surface at `ALL /auth/api/*`.
    // Hence a second boot of the entry, on its own database file, with the
    // secret set.
    vi.resetModules();
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
    vi.stubEnv('MASTRA_DB_PATH', selfManagedDbPath);

    const { mastra } = await import('./index');

    const authApi = mastra.getServer()?.apiRoutes?.find(route => route.path === '/auth/api/*');
    expect(authApi?.method).toBe('ALL');
  });
});
