/**
 * The sandbox selection, its container ceilings and its concurrent-session cap,
 * Story 5.5 lifted out of the entry.
 *
 * These assertions moved here unchanged from `../index.test.ts`. Three things in
 * them are invisible to every other check in this repository: the branch ORDER
 * that keeps agent work on this host, the `DockerSandboxOptions` numbers — no
 * container is ever created in the verify gate, and nothing else can observe
 * that object — and the cap, which no installed package enforces.
 *
 * Unlike `./auth` and `./integrations` this module has no load-time side effect,
 * so the environment is arranged per case with `vi.stubEnv`. The preamble still
 * sweeps first, and it has to: these blocks rely on an empty environment rather
 * than on exhaustive stubbing, so an inherited `FACTORY_SANDBOX_MEMORY_GIB`
 * would silently configure the default-value cases into passing against the
 * wrong number. Keys are set with `vi.stubEnv` and never assigned, so no key
 * name appears here as a literal `process.env` read, which the verify gate
 * counts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
// Type-only, so it is erased before the sweep below matters: a static VALUE
// import would run ahead of it and let an inherited variable configure the
// module under test.
import type { MastraSandbox } from '@mastra/core/workspace';

// Every env var this module reads BY NAME starts with one of these. Sweeping the
// whole space keeps an inherited value from configuring a case; PATH/HOME and the
// rest of the shell are untouched, because `localSandboxEnv` below is about
// exactly those and stubs them itself. `VERCEL_` is swept too because a
// per-project allow-list forwards a host variable whose name is read from the
// mapping rather than written in this module — so the families the cases below
// name are swept, and each case still stubs every name it asserts on.
const CONFIG_ENV_PREFIXES = ['FACTORY_', 'MASTRA_', 'MASTRACODE_', 'E2B_', 'EXPO_', 'VERCEL_'];
// DOCKER_HOST is swept even though this module never reads it: the docker tests
// below construct a real `DockerSandbox`, whose `new Docker()` makes
// docker-modem read DOCKER_HOST itself and throw on a value it cannot parse.
// Inherited from an operator's shell, that would fail the verify gate for a
// reason having nothing to do with the code under test.
const CONFIG_ENV_EXACT = ['DOCKER_HOST'];

for (const key of Object.keys(process.env)) {
  if (CONFIG_ENV_PREFIXES.some(prefix => key.startsWith(prefix)) || CONFIG_ENV_EXACT.includes(key)) {
    delete process.env[key];
  }
}

// Static `import` statements are evaluated before any module body statement, so
// the module under test is pulled in with `await import(...)` once the sweep
// above has run. The cap block reads the module-level `liveDockerSandboxes` the
// `selectSandbox` block populated, so both have to see the same generation of
// the module — which is why no block above the last one calls
// `vi.resetModules()`. The last block has to: it exercises the exported slot,
// whose platform-env check is resolved at module LOAD, so each of its cases
// needs a generation of its own. It runs last for exactly that reason.
const {
  LOCAL_SANDBOX_ENV_KEYS,
  dockerSandboxEnv,
  dockerSandboxOptions,
  liveDockerSandboxes,
  localSandboxEnv,
  selectSandbox,
} = await import('./sandbox');
// Deferred for the same reason as the module under test: a static import runs
// before the sweep above, and constructing a Docker client reads DOCKER_HOST.
const { DockerSandbox } = await import('@mastra/docker');

/**
 * The allow-list this module forwards into a `LocalSandbox`, restated here
 * rather than derived from the real constant. What the restatement buys is that
 * the list below is what a reviewer reads: the behavioural tests assert against
 * these literals, so changing the module's list without changing this one is a
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

describe('localSandboxEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards exactly the allow-list this file states, so a key added to the module fails here', () => {
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
 * repository can observe a `DockerSandboxOptions` — the slot hands it straight
 * to the constructor, and no container is ever created in the verify gate — so
 * these assertions are the only place a quota computed against the wrong period,
 * or a memory limit passed in gibibytes where Docker wants bytes, is visible.
 * The numbers are written out as literals rather than recomputed from the
 * module's constants: a test that repeats the production arithmetic agrees with
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

  it('forwards EXPO_TOKEN into the container, trimmed, and nothing else from the host', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('EXPO_TOKEN', '  expo-token-value  ');
    vi.stubEnv('DATABASE_URL', 'postgres://secret');
    vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'secret');

    expect(dockerSandboxEnv()).toEqual({ EXPO_TOKEN: 'expo-token-value' });
    expect(dockerSandboxOptions('session-abc').env).toEqual({ EXPO_TOKEN: 'expo-token-value' });
  });

  it('omits `env` entirely when EXPO_TOKEN is unset or blank', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    for (const value of [undefined, '', '   ']) {
      vi.stubEnv('EXPO_TOKEN', value);
      expect(dockerSandboxEnv()).toEqual({});
      expect(dockerSandboxOptions('session-abc')).not.toHaveProperty('env');
    }
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
    // '0x10' through ' 3 ' are the spellings bare `Number` would turn into a
    // different valid number (16, 3, 1000, 5, 3) rather than into "use the
    // default", which is why the parser demands a run of digits:
    // `FACTORY_SANDBOX_MEMORY_GIB=1e3` must be a 10 GiB container, not a 1000 GiB
    // one. The last one is a run of digits past the safe-integer range, and it
    // FALLS BACK rather than being refused by the bound below — the parser sees
    // it first and returns undefined, so the bound never sees a number at all.
    for (const bad of ['abc', '0', '-2', '2.5', '', '0x10', '0b11', '1e3', '+5', ' 3 ', '99999999999999999999']) {
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

  it('accepts a ceiling equal to the whole sandbox budget of this host', () => {
    // The bound is inclusive, and these are its two numbers written out: 10 GiB
    // and 4 cores per container times the 3 concurrent sessions the host is
    // sized for. Literals rather than arithmetic against the module's constants,
    // which catches exactly one direction: LOWERING either default, or the
    // concurrency count, lowers the bound and turns this case into a refusal.
    // Raising one lifts the bound and leaves the stubbed 30 and 12 accepted with
    // the same expected numbers, so this is not a pin on the bound's value — the
    // two refusal cases below are.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '30');
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '12');

    const options = dockerSandboxOptions('session-abc');

    expect(options.memory).toBe(30 * 1024 * 1024 * 1024);
    expect(options.memorySwap).toBe(30 * 1024 * 1024 * 1024);
    expect(options.cpuQuota).toBe(1_200_000);
  });

  it('refuses a memory ceiling above what this host can serve, rather than handing Docker the number', () => {
    // `HostConfig.Memory` takes any integer, so an oversized knob becomes a
    // container the daemon fails to create — a failure that names no key. The
    // refusal happens here instead, and by throwing rather than returning, so it
    // cannot fall through to the Platform or E2B arms of `selectSandbox`.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '31');

    // Key, offending value, the bound, and where the bound is documented: an
    // operator reading only the error has to be able to act on it. One regex
    // across all four rather than a match each, because the value and the bound
    // are both small integers — asserted separately, a message that had swapped
    // them ("is 30, which is more than the 31 GiB") would satisfy every match.
    expect(() => dockerSandboxOptions('session-abc')).toThrow(
      /FACTORY_SANDBOX_MEMORY_GIB is 31, which is more than the 30 GiB[\s\S]*sandbox\/README\.md/,
    );
  });

  it('refuses a CPU ceiling above what this host can serve', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '13');

    expect(() => dockerSandboxOptions('session-abc')).toThrow(
      /FACTORY_SANDBOX_CPUS is 13, which is more than the 12 cores[\s\S]*sandbox\/README\.md/,
    );
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
 * The per-project half of the same knobs. Each `FACTORY_SANDBOX_PROJECT_*` key
 * is an `owner/name=value` mapping keyed by the repository Factory binds a
 * session to, so what these cases pin is WHICH session an override reaches —
 * the block above pins what an override says. Nothing else in this repository
 * can see the scoping: a matched entry is multiplied into the very same
 * `DockerSandboxOptions`, and no container is created in the verify gate.
 *
 * The repository slugs are written out rather than shared with the block below,
 * because the claim under test is that a slug is matched EXACTLY: two blocks
 * reading one constant would keep agreeing with each other through a change to
 * the matching rule.
 */
describe('dockerSandboxOptions per-project mappings', () => {
  const REPO = 'koval-yurko/eleven-labs-english-agent';
  const OTHER_REPO = 'acme/widgets';
  const GLOBAL_IMAGE = 'factory-sandbox:2026-09-23';
  const PROJECT_IMAGE = 'factory-sandbox:2026-10-11';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('gives the matching repository its own image, and every other session the global one', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_IMAGE', `${REPO}=${PROJECT_IMAGE}`);

    expect(dockerSandboxOptions('session-abc', REPO).image).toBe(PROJECT_IMAGE);
    expect(dockerSandboxOptions('session-abc', OTHER_REPO).image).toBe(GLOBAL_IMAGE);
    // A session Factory bound to no repository has nothing to match an entry
    // against, so it takes the global image exactly as an unmatched one does.
    expect(dockerSandboxOptions('session-abc').image).toBe(GLOBAL_IMAGE);
  });

  it('resolves several entries and hands each repository its own', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_IMAGE', `${REPO}=${PROJECT_IMAGE};${OTHER_REPO}=factory-sandbox:2026-10-01`);

    expect(dockerSandboxOptions('session-abc', REPO).image).toBe(PROJECT_IMAGE);
    expect(dockerSandboxOptions('session-def', OTHER_REPO).image).toBe('factory-sandbox:2026-10-01');
  });

  it('reads a blank entry value as no override, so the global key still decides', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_IMAGE', `${REPO}=   `);

    expect(dockerSandboxOptions('session-abc', REPO).image).toBe(GLOBAL_IMAGE);
  });

  it('refuses when no image resolves for this repository, naming the global key', () => {
    // An entry for a DIFFERENT repository is not an image for this one, and the
    // package default still carries neither git nor gh.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', undefined);
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_IMAGE', `${OTHER_REPO}=${PROJECT_IMAGE}`);

    expect(() => dockerSandboxOptions('session-abc', REPO)).toThrow(/FACTORY_SANDBOX_IMAGE/);
  });

  it('gives the matching repository its own ceilings', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '4');
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '2');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_MEMORY_GIB', `${REPO}=8`);
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_CPUS', `${REPO}=6`);

    const options = dockerSandboxOptions('session-abc', REPO);
    expect(options.memory).toBe(8 * 1024 * 1024 * 1024);
    // Swap follows the per-project memory, or the "8 GiB cap" would be 8 GiB of
    // RAM plus 8 GiB of swap for this repository alone.
    expect(options.memorySwap).toBe(8 * 1024 * 1024 * 1024);
    expect(options.cpuQuota).toBe(600_000);

    // Same host, same mappings, a different repository: the global numbers.
    const other = dockerSandboxOptions('session-def', OTHER_REPO);
    expect(other.memory).toBe(4 * 1024 * 1024 * 1024);
    expect(other.cpuQuota).toBe(200_000);
  });

  it('trims an entry and its value, so a readable mapping is not a different number', () => {
    // Entries are separated by semicolons, so an operator pads them to keep a
    // long mapping readable. That padding is the mapping's own syntax and is
    // trimmed — around an entry, and after the `=`. Padding INSIDE the key half
    // is not trimmed and is refused by the case below, because the slug has to be
    // the one Factory reports rather than something near it.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '4');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_MEMORY_GIB', `${OTHER_REPO}=2;  ${REPO}= 8  `);

    expect(dockerSandboxOptions('session-abc', REPO).memory).toBe(8 * 1024 * 1024 * 1024);
  });

  it('ignores a malformed per-project ceiling and falls back to the global one', () => {
    // The same spelling rule the global knob has, for the same reason: `1e3` and
    // `+5` read as whole numbers but are not runs of digits, and rounding either
    // into something plausible is worse than taking what the operator set
    // globally. The last one is past the safe-integer range, so the parser — not
    // the bound below — is what rejects it.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '6');
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '3');

    for (const bad of ['abc', '0', '-2', '2.5', '0x10', '0b11', '1e3', '+5', '99999999999999999999']) {
      vi.stubEnv('FACTORY_SANDBOX_PROJECT_MEMORY_GIB', `${REPO}=${bad}`);
      vi.stubEnv('FACTORY_SANDBOX_PROJECT_CPUS', `${REPO}=${bad}`);

      const options = dockerSandboxOptions('session-abc', REPO);
      expect(options.memory).toBe(6 * 1024 * 1024 * 1024);
      expect(options.cpuQuota).toBe(300_000);
    }
  });

  it('refuses a per-project ceiling above the host bound, naming the per-project key', () => {
    // The bound is the host's, not the key's: an entry cannot raise what one
    // container can be given. Naming the PER-PROJECT key is the point — the
    // operator has to be told which of the two lines to edit.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '4');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_MEMORY_GIB', `${REPO}=31`);

    expect(() => dockerSandboxOptions('session-abc', REPO)).toThrow(
      /FACTORY_SANDBOX_PROJECT_MEMORY_GIB is 31, which is more than the 30 GiB[\s\S]*sandbox\/README\.md/,
    );

    vi.stubEnv('FACTORY_SANDBOX_PROJECT_MEMORY_GIB', `${REPO}=8`);
    vi.stubEnv('FACTORY_SANDBOX_CPUS', '2');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_CPUS', `${REPO}=13`);

    expect(() => dockerSandboxOptions('session-abc', REPO)).toThrow(
      /FACTORY_SANDBOX_PROJECT_CPUS is 13, which is more than the 12 cores[\s\S]*sandbox\/README\.md/,
    );
  });

  it('refuses a mapping entry it cannot read, naming the key rather than overriding nothing', () => {
    // Skipping an unreadable entry would leave a session without the override
    // its operator wrote, surfacing later as a missing credential or a wrong
    // ceiling — far from the key that caused it.
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', GLOBAL_IMAGE);
    const PROJECT_KEYS = [
      'FACTORY_SANDBOX_PROJECT_IMAGE',
      'FACTORY_SANDBOX_PROJECT_MEMORY_GIB',
      'FACTORY_SANDBOX_PROJECT_CPUS',
      'FACTORY_SANDBOX_PROJECT_ENV',
    ];
    const unreadable: Array<[string, string]> = [
      // No `=` at all.
      ['FACTORY_SANDBOX_PROJECT_IMAGE', PROJECT_IMAGE],
      // A key half that is not `owner/name`, so it could never match a session.
      ['FACTORY_SANDBOX_PROJECT_IMAGE', `eleven-labs-english-agent=${PROJECT_IMAGE}`],
      ['FACTORY_SANDBOX_PROJECT_MEMORY_GIB', 'nope'],
      ['FACTORY_SANDBOX_PROJECT_CPUS', `koval-yurko/eleven-labs-english-agent/extra=4`],
      // A slug with padding before the `=` is not the slug Factory reports.
      ['FACTORY_SANDBOX_PROJECT_MEMORY_GIB', `${REPO} = 8`],
      // The same repository twice: which entry applies is ambiguous.
      ['FACTORY_SANDBOX_PROJECT_ENV', `${REPO}=VERCEL_TOKEN;${REPO}=VERCEL_ORG_ID`],
    ];

    for (const [key, value] of unreadable) {
      // Every mapping is cleared first, so the case fails on the key it names
      // rather than on one left over from the case before it.
      for (const projectKey of PROJECT_KEYS) vi.stubEnv(projectKey, undefined);
      vi.stubEnv(key, value);

      expect(() => dockerSandboxOptions('session-abc', REPO)).toThrow(new RegExp(key));
    }
  });
});

/**
 * Which host credentials a project's container gets. `EXPO_TOKEN` is forwarded
 * to every session and the block above pins that; everything else is listed per
 * repository, so what is invisible anywhere else in this repository is that one
 * project's credentials do NOT reach another project's session. A Vercel token
 * handed to every session would be readable by every repository any agent ever
 * clones here.
 */
describe('dockerSandboxEnv per-project allow-list', () => {
  const REPO = 'koval-yurko/eleven-labs-english-agent';
  const OTHER_REPO = 'acme/widgets';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('forwards the listed host variables to the repository that lists them, and to no other', () => {
    vi.stubEnv('EXPO_TOKEN', 'expo-token');
    vi.stubEnv('VERCEL_TOKEN', '  vercel-token  ');
    vi.stubEnv('VERCEL_ORG_ID', 'team_123');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_456');
    vi.stubEnv('DATABASE_URL', 'postgres://secret');
    vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'secret');
    vi.stubEnv(
      'FACTORY_SANDBOX_PROJECT_ENV',
      `${REPO}=VERCEL_TOKEN,VERCEL_PROJECT_ID;${OTHER_REPO}=VERCEL_ORG_ID`,
    );

    // Disjoint sets on purpose: each repository gets its own entry and nothing
    // from the other's, and no host secret that no entry names.
    expect(dockerSandboxEnv(REPO)).toEqual({
      EXPO_TOKEN: 'expo-token',
      VERCEL_TOKEN: 'vercel-token',
      VERCEL_PROJECT_ID: 'prj_456',
    });
    expect(dockerSandboxEnv(OTHER_REPO)).toEqual({
      EXPO_TOKEN: 'expo-token',
      VERCEL_ORG_ID: 'team_123',
    });
  });

  it('reaches the container through the options, so the scoping is what a session actually gets', () => {
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', 'factory-sandbox:2026-09-23');
    vi.stubEnv('VERCEL_TOKEN', 'vercel-token');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_ENV', `${REPO}=VERCEL_TOKEN`);

    expect(dockerSandboxOptions('session-abc', REPO).env).toEqual({ VERCEL_TOKEN: 'vercel-token' });
    // An unmatched repository gets nothing project-scoped, so `env` is omitted
    // entirely rather than present-and-empty.
    expect(dockerSandboxOptions('session-def', OTHER_REPO)).not.toHaveProperty('env');
  });

  it('forwards a listed variable that is unset or blank as nothing, so a project can be listed early', () => {
    vi.stubEnv('VERCEL_TOKEN', undefined);
    vi.stubEnv('VERCEL_ORG_ID', '   ');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_456');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_ENV', `${REPO}=VERCEL_TOKEN,VERCEL_ORG_ID,VERCEL_PROJECT_ID,`);

    // The trailing comma is the same case as a blank name: an entry that lists
    // nothing is not a malformed mapping.
    expect(dockerSandboxEnv(REPO)).toEqual({ VERCEL_PROJECT_ID: 'prj_456' });
  });

  it('forwards nothing project-scoped to a session with no repository, or when no mapping is set', () => {
    vi.stubEnv('EXPO_TOKEN', 'expo-token');
    vi.stubEnv('VERCEL_TOKEN', 'vercel-token');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_ENV', `${REPO}=VERCEL_TOKEN`);

    expect(dockerSandboxEnv()).toEqual({ EXPO_TOKEN: 'expo-token' });
    expect(dockerSandboxEnv(undefined)).toEqual({ EXPO_TOKEN: 'expo-token' });

    for (const value of [undefined, '', '   ']) {
      vi.stubEnv('FACTORY_SANDBOX_PROJECT_ENV', value);
      expect(dockerSandboxEnv(REPO)).toEqual({ EXPO_TOKEN: 'expo-token' });
    }
  });

  it('matches the repository exactly, so a near-miss slug is a different project', () => {
    vi.stubEnv('VERCEL_TOKEN', 'vercel-token');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_ENV', `${REPO}=VERCEL_TOKEN`);

    const nearMisses = [
      'koval-yurko/eleven-labs-english-agent-2',
      'koval-yurko/eleven-labs',
      'eleven-labs-english-agent',
      'KOVAL-YURKO/eleven-labs-english-agent',
      'other-owner/eleven-labs-english-agent',
    ];
    for (const slug of nearMisses) expect(dockerSandboxEnv(slug)).toEqual({});

    // Padded on the SESSION side: Factory reports the slug, but a padded value
    // must not silently miss the entry the operator wrote.
    expect(dockerSandboxEnv(`  ${REPO}  `)).toEqual({ VERCEL_TOKEN: 'vercel-token' });
  });
});

/**
 * Which provider a session gets, and — the whole point of the Docker branch —
 * in what ORDER the candidates are considered. Nothing else in this repository
 * can see that order: reordering the branches leaves `tsc` clean and every
 * other test green, while quietly handing agent work to a cloud VM whenever a
 * platform variable is left behind in `.env`.
 *
 * `platformSandboxConfigured` is the module-level platform-env check, passed
 * in, so both arms are reachable from a test that swept the environment before
 * importing the module.
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

  it('refuses the session rather than falling through when a knob is above its bound', () => {
    // Same shape and same reason as the image case above: `sandbox/README.md`
    // promises an over-bound knob relocates nothing, and that claim is about THIS
    // function, not about `dockerSandboxOptions` in isolation. With the platform
    // and E2B variables set, a bound check that returned — or that was caught —
    // instead of throwing would hand the session to a cloud VM and leave every
    // other test green.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '31');
    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(() => selectSandbox(ctx, true)).toThrow(/FACTORY_SANDBOX_MEMORY_GIB/);
  });

  it('keys the per-project overrides on the repository Factory bound the session to', () => {
    // The scoping itself is pinned against `dockerSandboxOptions` above, but it
    // is only real if THIS function passes the repository through. The refusal is
    // the observable, because a `DockerSandbox` keeps its resolved image private:
    // drop the argument and the entry never matches, so this session is admitted
    // on the global 4 GiB instead of throwing.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('FACTORY_SANDBOX_IMAGE', IMAGE);
    vi.stubEnv('FACTORY_SANDBOX_MEMORY_GIB', '4');
    vi.stubEnv('FACTORY_SANDBOX_PROJECT_MEMORY_GIB', 'koval-yurko/eleven-labs-english-agent=31');

    expect(() => selectSandbox({ ...ctx, repoFullName: 'koval-yurko/eleven-labs-english-agent' }, false)).toThrow(
      /FACTORY_SANDBOX_PROJECT_MEMORY_GIB/,
    );

    // Same host, same mapping, a session bound to another repository: the entry
    // does not reach it, so it is admitted on the global ceiling.
    expect(selectSandbox({ ...ctx, repoFullName: 'acme/widgets' }, false).name).toBe('DockerSandbox');
    // And a session with no repository at all takes the global value too.
    expect(selectSandbox(ctx, false).name).toBe('DockerSandbox');
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
 * this module, and `tsc` cannot see a capacity rule. No container is ever
 * created in the verify gate either, which leaves these assertions as the only
 * automated witness that a fourth concurrent session is refused rather than
 * handed its own 10 GiB ceiling on a host sized for three.
 *
 * All but the last test drive their own `Map`, injected as `selectSandbox`'s
 * third argument, so no test can leak occupancy into the next one. That
 * injection cannot see which map the production call site binds to, though —
 * the exported `sandbox` slot passes two arguments and takes the default — so
 * the last test deliberately drives the shared `liveDockerSandboxes`, clearing
 * it first because `describe('selectSandbox')` above already registered a
 * session in it.
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
    // `platformSandboxConfigured` true in production. Inert test values.
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
    // passing only two arguments, exactly as the exported `sandbox` slot does.
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
 * The exported `sandbox` slot — the thing `./factory` actually hands to
 * `MastraFactory`, and the only caller of `selectSandbox` in production.
 *
 * Every block above injects `platformSandboxConfigured` by hand, which cannot
 * see what the real call site passes: hard-coding that argument to `false`, or
 * swapping the `.some` and `.every` of `hasPlatformSandboxEnv`, leaves `tsc`,
 * all of those tests and every gate command green while the deployment loses
 * the platform arm or gains it on an incomplete credential group. The slot
 * resolves that check ONCE, at module load, so each case here takes a fresh
 * generation of the module.
 *
 * The two halves of the check are pinned by the asymmetric cases: a credential
 * pair where only ONE is set still counts (`.some`), while an id pair where only
 * one is set does not (`.every`). Both spellings typecheck, and swapping them
 * inverts exactly those two cases and nothing else.
 */
describe('the exported sandbox slot', () => {
  const IMAGE = 'factory-sandbox:2026-09-23';
  const ctx = {
    sessionId: 'slot-session',
    repoFullName: undefined,
    setupCommand: undefined,
    getRepositoryAccess: undefined,
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Every key the slot resolves at load, stubbed, then a fresh generation of it. */
  async function loadSlot(env: {
    FACTORY_SANDBOX_PROVIDER?: string;
    FACTORY_SANDBOX_IMAGE?: string;
    E2B_API_KEY?: string;
    MASTRA_PLATFORM_ACCESS_TOKEN?: string;
    MASTRA_PLATFORM_SECRET_KEY?: string;
    MASTRA_ENVIRONMENT_ID?: string;
    MASTRA_PROJECT_ID?: string;
  }) {
    for (const key of [
      'FACTORY_SANDBOX_PROVIDER',
      'FACTORY_SANDBOX_IMAGE',
      'E2B_API_KEY',
      'MASTRA_PLATFORM_ACCESS_TOKEN',
      'MASTRA_PLATFORM_SECRET_KEY',
      'MASTRA_ENVIRONMENT_ID',
      'MASTRA_PROJECT_ID',
    ] as const) {
      vi.stubEnv(key, env[key]);
    }
    vi.resetModules();
    return import('./sandbox');
  }

  it('hands a Docker sandbox to the factory for the `docker` provider', async () => {
    const { sandbox } = await loadSlot({ FACTORY_SANDBOX_PROVIDER: 'docker', FACTORY_SANDBOX_IMAGE: IMAGE });

    expect(sandbox(ctx).name).toBe('DockerSandbox');
  });

  it('takes the platform arm when the whole group is set and no provider is selected', async () => {
    // The arm the docker branch has to stay ahead of. With
    // `platformSandboxConfigured` hard-coded to `false` this returns a
    // LocalSandbox instead, and nothing else in the suite notices.
    const { sandbox } = await loadSlot({
      MASTRA_PLATFORM_ACCESS_TOKEN: 'stray-token',
      MASTRA_PLATFORM_SECRET_KEY: 'stray-key',
      MASTRA_ENVIRONMENT_ID: 'stray-environment',
      MASTRA_PROJECT_ID: 'stray-project',
    });

    expect(sandbox(ctx).name).toBe('PlatformSandbox');
  });

  it('counts the credential pair as configured when either one of them is set', async () => {
    const { sandbox } = await loadSlot({
      MASTRA_PLATFORM_ACCESS_TOKEN: 'stray-token',
      MASTRA_ENVIRONMENT_ID: 'stray-environment',
      MASTRA_PROJECT_ID: 'stray-project',
    });

    expect(sandbox(ctx).name).toBe('PlatformSandbox');
  });

  it('requires BOTH ids, so a half-configured project falls back rather than dialling the platform', async () => {
    // `PlatformSandbox` builds a real platform client at construction and throws
    // without the id it is missing, so treating this group as configured would
    // turn a half-filled `.env` into a failed session rather than a local one.
    const { sandbox } = await loadSlot({
      MASTRA_PLATFORM_ACCESS_TOKEN: 'stray-token',
      MASTRA_PLATFORM_SECRET_KEY: 'stray-key',
      MASTRA_ENVIRONMENT_ID: 'stray-environment',
    });

    expect(sandbox(ctx).name).toBe('LocalSandbox');
  });
});
