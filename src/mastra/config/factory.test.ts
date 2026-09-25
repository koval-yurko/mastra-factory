/**
 * The factory call itself: which environment value lands in which
 * `MastraFactory` slot.
 *
 * Nothing tested this while it sat in the entry, and every slot below is a place
 * a typo empties silently. `tsc` types the whole option object as optional, so a
 * dropped `configVersion`, a `publicUrl` that reads the wrong local, an
 * `allowedOrigins` that stops filtering, a `maxInFlight` that stops rejecting
 * junk, or a `githubAppSlug` hoisted out of `platform: { … }` all compile, and
 * the deployment discovers each of them in production — as a config version that
 * no longer matches, a CORS origin the SPA is refused from, a dispatcher running
 * at the wrong width, or an App that stops recognising its own comments.
 *
 * The call has to stay a literal object argument — the verify gate parses its
 * top-level properties — so the config cannot be extracted to a named export and
 * read directly. Instead `@mastra/factory` is mocked with `importOriginal`
 * spread and only `MastraFactory` swapped for a class that records its argument:
 * `createFactorySecretEncryption`, which `./auth` imports from the same module,
 * stays real. The four storage/pubsub packages are stubbed for the reason
 * `infrastructure.test.ts` stubs them — to keep the suite from dialling anything
 * and from opening the operator's real libSQL file — and the pairings they carry
 * are asserted there rather than here.
 *
 * `vi.resetModules()` per case re-evaluates the whole graph, `./public-url`
 * included, which is what lets one stubbed `MASTRACODE_PUBLIC_URL` be observed
 * reaching both of its consumers in a single case. Environment is arranged with
 * `vi.stubEnv` only, never by assignment, so no key name appears here as a
 * literal `process.env` read: the gate counts those, and after Story 5.6 every
 * declared key has at most one read site across `src/`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because `vi.mock` calls are lifted above the module body: the
// capture slot and the stub base class have to exist before any factory below
// can run. `captured` survives `vi.resetModules()` — the mock factories are
// re-run, but they close over this same object.
const { captured, StubBackend } = vi.hoisted(() => ({
  captured: { config: undefined as Record<string, unknown> | undefined },
  StubBackend: class StubBackend {
    constructor(readonly options: Record<string, unknown>) {}
  },
}));

vi.mock('@mastra/factory', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    MastraFactory: class MastraFactory {
      constructor(config: Record<string, unknown>) {
        captured.config = config;
      }
    },
  };
});
vi.mock('@mastra/pg', () => ({
  PgFactoryStorage: class PgFactoryStorage extends StubBackend {},
  PgVector: class PgVector extends StubBackend {},
}));
vi.mock('@mastra/libsql', () => ({
  LibSQLFactoryStorage: class LibSQLFactoryStorage extends StubBackend {},
}));
vi.mock('@mastra/redis-streams', () => ({
  RedisStreamsPubSub: class RedisStreamsPubSub extends StubBackend {},
}));
vi.mock('@mastra/code-sdk/utils/project', () => ({
  getDatabasePath: () => '/stub/mastracode/mastra.db',
}));
vi.mock('@mastra/code-sdk/utils/storage-maintenance', () => ({ DEFAULT_RETENTION: { stub: 'DEFAULT_RETENTION' } }));

// Every variable the module graph under `./factory` consults starts with one of
// these prefixes or is named exactly below, except `NODE_ENV`, which
// `./database-url` reads and which `loadFactoryConfig` stubs on every case
// rather than sweeping. Sweeping the space before the first
// dynamic import keeps an inherited value from configuring a case that never
// mentioned the key — the same reason `../index.test.ts` sweeps, and the same
// list, because `./factory` is what that boot reaches these modules through.
const FACTORY_ENV_PREFIXES = ['FACTORY_', 'MASTRA_', 'MASTRACODE_', 'WORKOS_', 'GITHUB_APP_', 'LINEAR_', 'SLACK_APP_', 'E2B_'];
const FACTORY_ENV_EXACT = ['REDIS_URL', 'DATABASE_URL', 'APP_DATABASE_URL', 'DOCKER_HOST', 'BETTER_AUTH_SECRET'];

for (const key of Object.keys(process.env)) {
  if (FACTORY_ENV_PREFIXES.some(prefix => key.startsWith(prefix)) || FACTORY_ENV_EXACT.includes(key)) {
    delete process.env[key];
  }
}

// Whichever case runs first here pays the cold transform of the whole `./factory`
// graph plus `@mastra/factory` — about 0.9s warm, the slowest case in the repo and
// roughly twice the next one. Vitest's 5s default leaves too little headroom for
// that on a loaded machine: the verify gate runs `npm test` a few entries after
// `npm ci`, and this file timed out there once while every case took 1-2ms on a
// re-run. The ceiling is raised for the file rather than for the one case that
// happens to be first today, since the cost belongs to the first import, not to
// any particular assertion.
vi.setConfig({ testTimeout: 30_000 });

/** The Slack group that makes a `SlackIntegration` real enough to diagnose. */
const SLACK_GROUP = {
  SLACK_APP_SIGNING_SECRET: 'slack-signing-secret',
  SLACK_APP_CLIENT_ID: 'slack-client-id',
  SLACK_APP_CLIENT_SECRET: 'slack-client-secret',
};

/**
 * Arrange the environment, re-evaluate the graph, and return the object the
 * factory was constructed with.
 *
 * `NODE_ENV` is stubbed to `test` on every case because `./database-url` refuses
 * to resolve without a connection string anywhere else, and no case here
 * configures a database.
 */
async function loadFactoryConfig(env: Record<string, string | undefined> = {}): Promise<Record<string, unknown>> {
  vi.stubEnv('NODE_ENV', 'test');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  // `./auth` warns that credentials will be stored in plaintext whenever no
  // encryption key is configured, which is every case here. Silenced rather than
  // asserted — `auth.test.ts` owns that warning.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  captured.config = undefined;
  vi.resetModules();
  await import('./factory');
  if (!captured.config) throw new Error('importing ./factory constructed no MastraFactory');
  return captured.config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the factory config', () => {
  it('carries the deployment config version as a literal', async () => {
    // The factory keys stored config by this string. Dropping the property, or
    // letting it drift, makes the deployment read someone else's config on the
    // next boot — and nothing else in this repository mentions the value.
    const config = await loadFactoryConfig();
    const { factoryConfigVersion } = await import('./factory');

    expect(config.configVersion).toBe('mastracode-web-v1');
    expect(config.configVersion).toBe(factoryConfigVersion);
  });

  it('nests the GitHub App slug inside platform rather than at the top level', async () => {
    // The slug is the one binding that is NOT a top-level property: at the top
    // level the factory ignores it and the deployment compares its own App login
    // against `undefined[bot]` on every pull request it opened, with tsc and
    // every other assertion here green.
    const config = await loadFactoryConfig({ GITHUB_APP_SLUG: 'my-factory' });

    expect(config.platform).toEqual({ githubAppSlug: 'my-factory' });
    expect(config).not.toHaveProperty('githubAppSlug');
  });
});

describe('publicUrl', () => {
  it('reaches both the factory slot and the Slack integration from the one read', async () => {
    // The whole point of `./public-url`: a single `MASTRACODE_PUBLIC_URL` read
    // feeds the browser-facing origin the factory serves from AND the origin the
    // Slack account-link OIDC routes are mounted on.
    //
    // How much of that this case can see: the factory half exactly, by value; the
    // Slack half only as "the fallback arm fired", because `oidcConfigured` is a
    // boolean and `SlackIntegration` exposes neither `oidcRedirectBaseUrl` nor
    // `uiOrigin` through any public member. So a SECOND read that drifted to a
    // different origin would still pass here — what rules that out is guard 41,
    // which counts the key's read sites, not this assertion.
    const config = await loadFactoryConfig({ ...SLACK_GROUP, MASTRACODE_PUBLIC_URL: 'https://factory.example' });

    expect(config.publicUrl).toBe('https://factory.example');
    const integrations = config.integrations as { id: string; diagnostics(): { oidcConfigured: boolean } }[];
    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(true);
  });

  it('is undefined when the key is unset, so the factory applies its own default', async () => {
    const config = await loadFactoryConfig();

    expect(config.publicUrl).toBeUndefined();
  });

  it('reads a whitespace-only value as unset in both slots', async () => {
    // Why `./public-url` trims and collapses a blank value to `undefined`: the
    // real `@mastra/factory` reaches for its own `http://localhost:4111` default
    // with `??`, so a raw `'   '` would be the deployment's public origin and
    // the Slack OIDC routes would mount against it. That default is NOT what
    // this case sees — `MastraFactory` is mocked here — only the two things
    // that decide it: the slot the factory would have defaulted from, and the
    // Slack fallback arm going empty.
    const config = await loadFactoryConfig({ ...SLACK_GROUP, MASTRACODE_PUBLIC_URL: '   ' });

    expect(config.publicUrl).toBeUndefined();
    const integrations = config.integrations as { id: string; diagnostics(): { oidcConfigured: boolean } }[];
    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(false);
  });

  it('trims a padded value before it reaches the factory slot', async () => {
    // The other half of the trim: padding is removed rather than carried into an
    // origin its consumers concatenate paths onto. Only the factory half is seen
    // by value; `oidcConfigured` is `Boolean(clientId && clientSecret &&
    // redirectBase)` and so reads `true` for the padded value either way — it is
    // asserted here to say the Slack arm stayed enabled, not that it was trimmed.
    const config = await loadFactoryConfig({ ...SLACK_GROUP, MASTRACODE_PUBLIC_URL: '  https://factory.example  ' });

    expect(config.publicUrl).toBe('https://factory.example');
    const integrations = config.integrations as { id: string; diagnostics(): { oidcConfigured: boolean } }[];
    const slack = integrations.find(integration => integration.id === 'slack');
    if (!slack) throw new Error('expected a SlackIntegration');
    expect(slack.diagnostics().oidcConfigured).toBe(true);
  });
});

describe('allowedOrigins', () => {
  it('is an empty list when the key is unset', async () => {
    // An empty ARRAY, not `undefined`: the `?? ''` arm is what keeps the slot a
    // list the factory can spread, and dropping it would hand it a string.
    const config = await loadFactoryConfig();

    expect(config.allowedOrigins).toEqual([]);
  });

  it('splits, trims and drops empty items', async () => {
    // Each of the three steps is load-bearing and independently deletable: a
    // padded `.env` line is the normal way this key is written, and an origin
    // with a stray space matches nothing, while an empty item — which a trailing
    // comma produces — would allow the origin `''`.
    const config = await loadFactoryConfig({ MASTRACODE_ALLOWED_ORIGINS: ' a.example , , b.example ' });

    expect(config.allowedOrigins).toEqual(['a.example', 'b.example']);
  });
});

describe('dispatcher.maxInFlight', () => {
  it('is the parsed value for a positive integer', async () => {
    const config = await loadFactoryConfig({ MASTRACODE_DISPATCH_MAX_IN_FLIGHT: '7' });

    expect(config.dispatcher).toEqual({ maxInFlight: 7 });
  });

  it('is undefined when the key is unset, leaving the dispatcher default', async () => {
    const config = await loadFactoryConfig();

    expect(config.dispatcher).toEqual({ maxInFlight: undefined });
  });

  it('is undefined for every value positiveInt rejects', async () => {
    // Reading this knob with `Number()` alone would hand the dispatcher `0`
    // (which stalls every background dispatch), `NaN`, or a negative width. The
    // parser is shared with the sandbox knobs, so the pairing — this key, that
    // parser — is what this case pins.
    for (const value of ['0', 'x', '-3', '1.5', '']) {
      const config = await loadFactoryConfig({ MASTRACODE_DISPATCH_MAX_IN_FLIGHT: value });
      expect(config.dispatcher).toEqual({ maxInFlight: undefined });
    }
  });
});
