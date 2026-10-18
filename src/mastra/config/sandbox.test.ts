/**
 * The sandbox selection, its container ceilings and its concurrent-session cap,
 * lifted out of the entry.
 *
 * These assertions moved here unchanged from `../index.test.ts`. Three things in
 * them are invisible to every other check in this repository: the branch ORDER
 * that keeps agent work on this host, the `DockerSandboxOptions` numbers — no
 * container is ever created in a test run, and nothing else can observe
 * that object — and the cap, which no installed package enforces.
 *
 * Unlike `./auth` and `./integrations` this module has no load-time side effect,
 * so the environment is arranged per case with `vi.stubEnv`. The preamble still
 * sweeps first, and it has to: these blocks rely on an empty environment rather
 * than on exhaustive stubbing, so an inherited `MASTRACODE_MAX_SANDBOXES`
 * would silently configure the default-value cases into passing against the
 * wrong number. Keys are set with `vi.stubEnv` and never assigned, so no key
 * name appears here as a literal `process.env` read, which AD-7
 * (`docs/architecture.md`) limits.
 *
 * Images, ceilings and secret lists come from the sandbox catalog, not from the
 * environment. `dockerSandboxOptions` takes one by argument; the blocks that go
 * through `selectSandbox` read the catalog file written below, because the slot
 * reads it from the server's cwd.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Type-only, so it is erased before the sweep below matters: a static VALUE
// import would run ahead of it and let an inherited variable configure the
// module under test.
import type { MastraSandbox } from '@mastra/core/workspace';

// Every env var this module reads starts with one of these. Sweeping the whole
// space keeps an inherited value from configuring a case; PATH/HOME and the rest
// of the shell are untouched, because `localSandboxEnv` below is about exactly
// those and stubs them itself.
const CONFIG_ENV_PREFIXES = ['FACTORY_', 'MASTRA_', 'MASTRACODE_', 'E2B_', 'EXPO_', 'VERCEL_'];
// DOCKER_HOST is swept even though this module never reads it: the docker tests
// below construct a real `DockerSandbox`, whose `new Docker()` makes
// docker-modem read DOCKER_HOST itself and throw on a value it cannot parse.
// Inherited from an operator's shell, that would fail `npm test` for a
// reason having nothing to do with the code under test.
const CONFIG_ENV_EXACT = ['DOCKER_HOST'];

for (const key of Object.keys(process.env)) {
  if (CONFIG_ENV_PREFIXES.some(prefix => key.startsWith(prefix)) || CONFIG_ENV_EXACT.includes(key)) {
    delete process.env[key];
  }
}

/** The catalog every case below uses: a shared image and two projects. */
const SHARED_IMAGE = 'factory-sandbox:2026-09-23-0123456789ab';
const APP_IMAGE = 'factory-sandbox/owner/app:2026-10-01-abcdefabcdef';
const CATALOG = {
  version: 1 as const,
  default: { image: SHARED_IMAGE, memoryGib: 1, cpus: 0.5 },
  projects: {
    'owner/app': { image: APP_IMAGE, memoryGib: 4, cpus: 2, secrets: ['VERCEL_TOKEN', 'EXPO_TOKEN'] },
    'owner/ceilings-only': { memoryGib: 2.5, cpus: 1.25, secrets: [] },
  },
};

// The slot reads `sandbox-catalog.json` from the server's cwd. Point the cwd at a
// folder that holds this catalog, so the blocks that go through `selectSandbox`
// see it; `loadSandboxCatalog` takes its folder by argument.
const catalogDir = mkdtempSync(join(tmpdir(), 'sandbox-catalog-'));
writeFileSync(join(catalogDir, 'sandbox-catalog.json'), JSON.stringify(CATALOG));
const emptyDir = mkdtempSync(join(tmpdir(), 'sandbox-no-catalog-'));
vi.spyOn(process, 'cwd').mockReturnValue(catalogDir);

/** A secret source with these values for `owner/app`, under the parameter names SSM would use. */
const secretsFor = (values: Record<string, string>, store = true) => ({
  values: (slug: string) => (slug === 'owner/app' ? values : {}),
  parameter: (slug: string, key: string) => (store ? `/factory/projects/${slug}/${key}` : undefined),
});
const NO_SECRETS = secretsFor({});

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
  dockerSandboxOptions,
  liveDockerSandboxes,
  loadSandboxCatalog,
  localSandboxEnv,
  projectSandboxEnv,
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
 * to the constructor, and no container is ever created in a test run — so
 * these assertions are the only place a quota computed against the wrong period,
 * or a memory limit passed in gibibytes where Docker wants bytes, is visible.
 * The numbers are written out as literals rather than recomputed from the
 * module's constants: a test that repeats the production arithmetic agrees with
 * whatever that arithmetic becomes.
 */
describe('dockerSandboxOptions', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const options = (repoFullName?: string, secrets = NO_SECRETS) =>
    dockerSandboxOptions('session-abc', repoFullName, CATALOG, secrets);

  it('gives a session with no project the shared image, the shared ceilings and no env', () => {
    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', undefined);

    expect(options()).toEqual({
      id: 'session-abc',
      image: SHARED_IMAGE,
      memory: 1024 * 1024 * 1024,
      // Equal to `memory`. Omitted, Docker would allow another 1 GiB of swap
      // on top, so the documented cap would be half the real ceiling.
      memorySwap: 1024 * 1024 * 1024,
      cpuPeriod: 100_000,
      // Half a core: half of every 100 ms period.
      cpuQuota: 50_000,
      pidsLimit: 4096,
      // Pinned, not inherited: Docker's own `--init` is off by default and the
      // package's `init` default is what turns it on, so leaving it out would
      // make the zombie reaping `pidsLimit` relies on a package default a minor
      // upgrade could flip with nothing here noticing.
      init: true,
      timeout: 900_000,
      workingDirectory: '/workspace',
    });
    // A repository the catalog does not name is the same as none.
    expect(options('owner/unlisted')).toEqual(options());
  });

  it('uses `workingDirectory`, never the package\'s deprecated `workingDir` alias', () => {
    // Both exist on DockerSandboxOptions and `workingDirectory` wins when both
    // are set, so passing the deprecated one would work until it is removed.
    const built = options();

    expect(built).toHaveProperty('workingDirectory');
    expect(built).not.toHaveProperty('workingDir');

    // The property check above only sees the object. The constructor is what
    // resolves option, deprecated alias and built-in default into one value, so
    // read the getter it narrows to `string` and confirm ours is what won.
    expect(new DockerSandbox(built).workingDirectory).toBe('/workspace');
  });

  it('passes no dockerOptions, leaving dockerode to read DOCKER_HOST itself', () => {
    // ops/README.md owns DOCKER_HOST; re-reading it here would be a second
    // source of truth that silently disagrees with the documented one.
    expect(options()).not.toHaveProperty('dockerOptions');
  });

  it('gives a project its own image and ceilings, in the units Docker expects', () => {
    const built = options('owner/app', secretsFor({ VERCEL_TOKEN: 'v', EXPO_TOKEN: 'e' }));

    expect(built.image).toBe(APP_IMAGE);
    // Not 4 — HostConfig.Memory is in bytes.
    expect(built.memory).toBe(4 * 1024 * 1024 * 1024);
    expect(built.memorySwap).toBe(4 * 1024 * 1024 * 1024);
    // The quota is derived from the pinned period, so the number means cores.
    expect(built.cpuPeriod).toBe(100_000);
    expect(built.cpuQuota).toBe(200_000);
  });

  it('falls back to the shared image, and turns decimal ceilings into whole bytes and microseconds', () => {
    const built = options('owner/ceilings-only');

    expect(built.image).toBe(SHARED_IMAGE);
    expect(built.memory).toBe(2684354560);
    expect(built.cpuQuota).toBe(125_000);
    expect(built).not.toHaveProperty('env');
  });

  it('falls back to the shared ceilings field by field', () => {
    const catalog = { ...CATALOG, projects: { 'owner/app': { image: APP_IMAGE, cpus: 3, secrets: [] } } };
    const built = dockerSandboxOptions('session-abc', 'owner/app', catalog, NO_SECRETS);

    expect(built.memory).toBe(1024 * 1024 * 1024);
    expect(built.cpuQuota).toBe(300_000);
  });

  it('matches the slug Factory reports in any case and with padding', () => {
    expect(options(' Owner/App ', secretsFor({ VERCEL_TOKEN: 'v', EXPO_TOKEN: 'e' })).image).toBe(APP_IMAGE);
  });

  it('does not address a project through a slug that walks out of its folder', () => {
    for (const slug of ['owner/..', '../app', 'owner/app/extra', 'owner', '']) {
      expect(options(slug).image).toBe(SHARED_IMAGE);
    }
  });

  it('forwards exactly the listed secrets, trimmed, under their own names, and nothing from the host', () => {
    vi.stubEnv('EXPO_TOKEN', 'host-expo-token');
    vi.stubEnv('DATABASE_URL', 'postgres://secret');
    vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'secret');
    const secrets = secretsFor({ VERCEL_TOKEN: ' vercel-value ', EXPO_TOKEN: 'expo-value', UNLISTED_TOKEN: 'never' });

    expect(options('owner/app', secrets).env).toEqual({ VERCEL_TOKEN: 'vercel-value', EXPO_TOKEN: 'expo-value' });
    // No project: no secret at all, even with EXPO_TOKEN in the host env.
    expect(options()).not.toHaveProperty('env');
  });

  it('refuses a session whose listed secret has no value, naming the parameter', () => {
    for (const blank of [undefined, '', '   ']) {
      const values: Record<string, string> = { VERCEL_TOKEN: 'v' };
      if (blank !== undefined) values.EXPO_TOKEN = blank;

      expect(() => options('owner/app', secretsFor(values))).toThrow(
        /owner\/app lists the sandbox secret\(s\) EXPO_TOKEN[\s\S]*\/factory\/projects\/owner\/app\/EXPO_TOKEN/,
      );
    }
  });

  it('refuses a session whose project lists secrets when there is no Parameter Store', () => {
    expect(() => options('owner/app', secretsFor({}, false))).toThrow(/VERCEL_TOKEN, EXPO_TOKEN[\s\S]*FACTORY_SSM_PARAMETER_PATH/);
  });

  it('falls back to /workspace for a blank or unset workdir, and trims a set one', () => {
    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', undefined);
    expect(options().workingDirectory).toBe('/workspace');

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', '');
    expect(options().workingDirectory).toBe('/workspace');

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', '   ');
    expect(options().workingDirectory).toBe('/workspace');

    vi.stubEnv('MASTRACODE_SANDBOX_WORKDIR', ' /srv/checkouts ');
    expect(options().workingDirectory).toBe('/srv/checkouts');
  });

  it('keys the sandbox on the session id, so a reconnect reattaches instead of provisioning a second container', () => {
    expect(dockerSandboxOptions('session-one', undefined, CATALOG).id).toBe('session-one');
    expect(dockerSandboxOptions('session-two', undefined, CATALOG).id).toBe('session-two');
  });
});

describe('projectSandboxEnv', () => {
  it('is empty for a project that lists no secrets', () => {
    expect(projectSandboxEnv('owner/app', [], secretsFor({ VERCEL_TOKEN: 'v' }))).toEqual({});
  });

  it('names every missing secret at once', () => {
    expect(() => projectSandboxEnv('owner/app', ['A_TOKEN', 'B_TOKEN'], NO_SECRETS)).toThrow(
      '/factory/projects/owner/app/A_TOKEN, /factory/projects/owner/app/B_TOKEN',
    );
  });

  it('never puts a secret value in the refusal', () => {
    const error = (() => {
      try {
        projectSandboxEnv('owner/app', ['VERCEL_TOKEN', 'EXPO_TOKEN'], secretsFor({ VERCEL_TOKEN: 'vercel-value' }));
      } catch (caught) {
        return caught as Error;
      }
    })();
    expect(error?.message).toContain('EXPO_TOKEN');
    expect(error?.message).not.toContain('vercel-value');
  });
});

describe('loadSandboxCatalog', () => {
  it('reads and validates the catalog in the given folder', () => {
    expect(loadSandboxCatalog(catalogDir)).toEqual(CATALOG);
  });

  it('names the file and the build step when the catalog is missing', () => {
    expect(() => loadSandboxCatalog(emptyDir)).toThrow(/sandbox-catalog\.json is missing[\s\S]*npm run build/);
  });

  it('refuses a file that is not JSON, or not a valid catalog', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sandbox-bad-catalog-'));
    writeFileSync(join(dir, 'sandbox-catalog.json'), '{');
    expect(() => loadSandboxCatalog(dir)).toThrow(/is not valid JSON/);

    writeFileSync(join(dir, 'sandbox-catalog.json'), JSON.stringify({ ...CATALOG, default: { ...CATALOG.default, image: 'factory-sandbox:latest' } }));
    expect(() => loadSandboxCatalog(dir)).toThrow(/image must be factory-sandbox:YYYY-MM-DD-<12 hex>/);
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

    const sandbox = selectSandbox(ctx, false);

    expect(sandbox.name).toBe('DockerSandbox');
    expect(sandbox.id).toBe('session-abc');
  });

  it('prefers Docker over the platform and E2B providers, so a stray cloud variable cannot relocate a session', () => {
    // The story's whole claim. With the branch order reversed this returns a
    // PlatformSandbox — or throws on the absent platform credentials — instead.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(selectSandbox(ctx, true).name).toBe('DockerSandbox');
  });

  it('gives a session its project\'s image from the catalog in the cwd', () => {
    // No Parameter Store in this process, so a project that lists secrets is
    // refused; `owner/ceilings-only` lists none.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');

    const sandbox = selectSandbox({ ...ctx, sessionId: 'session-project', repoFullName: 'owner/ceilings-only' }, false);

    expect(sandbox.name).toBe('DockerSandbox');
  });

  it('refuses the session rather than falling through when a project secret is missing', () => {
    // The refusal has to be observable HERE, not only against
    // `dockerSandboxOptions` in isolation. Making the docker branch conditional
    // on resolvable options — or wrapping it in a try/catch — would leave every
    // other test in this file green while silently restoring the off-host
    // fall-through this story exists to remove, so the platform and E2B
    // variables are set to make that fall-through visible if it returns.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(() => selectSandbox({ ...ctx, repoFullName: 'owner/app' }, true)).toThrow(/FACTORY_SSM_PARAMETER_PATH/);
  });

  it('trims the provider value, so a padded .env line still selects Docker', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', '  docker  ');

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
 * created in a test run either, which leaves these assertions as the only
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
    const live = new Map<string, MastraSandbox>();

    const sandbox = selectSandbox(ctxFor('session-0'), false, live);

    expect(sandbox.name).toBe('DockerSandbox');
    // Registered under the SAME key the reattach check looks up: registering by
    // anything else leaves every resumed session claiming a fresh slot.
    expect(live.get('session-0')).toBe(sandbox);
  });

  it('refuses the fourth distinct session at the documented default, naming the key and the number', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
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
    const live = new Map<string, MastraSandbox>();

    // An off-by-one here is the difference between a host sized for three
    // running two and one running four.
    for (const id of ['a', 'b', 'c']) expect(selectSandbox(ctxFor(id), false, live).name).toBe('DockerSandbox');
    expect(() => selectSandbox(ctxFor('d'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES/);
  });

  it('honours a raised cap', () => {
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
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
    const live = registryWith(3);

    expect(selectSandbox(ctxFor('session-1'), false, live).name).toBe('DockerSandbox');
    expect(live.size).toBe(3);
  });

  it('frees the slot of a session Factory has stopped or destroyed', () => {
    // `stop()`/`destroy()` on the instance this slot returned are the whole
    // release path — there is no eviction hook and no timer.
    for (const released of ['stopped', 'destroyed'] as const) {
      vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
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
        vi.stubEnv('MASTRACODE_MAX_SANDBOXES', bad);
      const live = registryWith(3);

      expect(() => selectSandbox(ctxFor('session-3'), false, live)).toThrow(/MASTRACODE_MAX_SANDBOXES is 3/);
    }
  });

  it('reports a missing project secret ahead of the cap', () => {
    // A missing secret breaks every session of that project; the cap refuses
    // only this one. The more general cause is the one worth naming.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    const live = registryWith(3);

    expect(() => selectSandbox({ ...ctxFor('session-3'), repoFullName: 'owner/app' }, false, live)).toThrow(
      /FACTORY_SSM_PARAMETER_PATH/,
    );
  });

  it('refuses rather than relocating the session to a configured cloud provider', () => {
    // NFR12. A cap that falls through is not a cap: it moves the work to a
    // third party's VM, which is the single thing this deployment's sandbox
    // configuration exists to prevent. Setting every cloud variable makes that
    // fall-through visible here if the refusal ever becomes a `return`.
    vi.stubEnv('FACTORY_SANDBOX_PROVIDER', 'docker');
    const live = registryWith(3);

    vi.stubEnv('MASTRA_PLATFORM_ACCESS_TOKEN', 'stray-token');
    vi.stubEnv('MASTRA_PROJECT_ID', 'stray-project');
    vi.stubEnv('MASTRA_ENVIRONMENT_ID', 'stray-environment');
    vi.stubEnv('E2B_API_KEY', 'stray-key');

    expect(() => selectSandbox(ctxFor('session-3'), true, live)).toThrow(/MASTRACODE_MAX_SANDBOXES/);
  });

  it('caps only the docker provider, leaving the others untouched', () => {
    // The number is sized from this host's memory against the memoryGib in
    // sandbox/sandbox.json, which no other provider reads — a cloud VM or
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
    E2B_API_KEY?: string;
    MASTRA_PLATFORM_ACCESS_TOKEN?: string;
    MASTRA_PLATFORM_SECRET_KEY?: string;
    MASTRA_ENVIRONMENT_ID?: string;
    MASTRA_PROJECT_ID?: string;
  }) {
    for (const key of [
      'FACTORY_SANDBOX_PROVIDER',
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
    const { sandbox } = await loadSlot({ FACTORY_SANDBOX_PROVIDER: 'docker' });

    expect(sandbox(ctx).name).toBe('DockerSandbox');
  });

  it('refuses every docker session when the cwd has no catalog, rather than falling through', async () => {
    // A server started from somewhere other than a build has no catalog. With
    // the whole platform group set, a refusal that returned would relocate the
    // session to a cloud VM.
    vi.mocked(process.cwd).mockReturnValue(emptyDir);
    try {
      const { sandbox } = await loadSlot({
        FACTORY_SANDBOX_PROVIDER: 'docker',
        MASTRA_PLATFORM_ACCESS_TOKEN: 'stray-token',
        MASTRA_PLATFORM_SECRET_KEY: 'stray-key',
        MASTRA_ENVIRONMENT_ID: 'stray-environment',
        MASTRA_PROJECT_ID: 'stray-project',
      });

      expect(() => sandbox(ctx)).toThrow(/sandbox-catalog\.json is missing/);
    } finally {
      vi.mocked(process.cwd).mockReturnValue(catalogDir);
    }
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
