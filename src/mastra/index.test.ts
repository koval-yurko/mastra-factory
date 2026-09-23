/**
 * Tests for the entry itself: that importing it boots, and that the auth
 * provider `./config/auth` selected is the one the factory is actually handed.
 *
 * Everything the entry used to construct now lives in `./config/` — including
 * the `MastraFactory` call itself, in `./config/factory` — and so do the
 * assertions about it: `config/factory.test.ts`, `config/auth.test.ts`,
 * `config/integrations.test.ts`, `config/sandbox.test.ts` and
 * `config/positive-int.test.ts` sit beside the modules they cover. What is left
 * here is the pair of questions only the entry can answer.
 *
 * These run inside the verify gate (`.bmad-loop/policy.toml` `[verify].commands`),
 * so a change that breaks environment parsing fails there rather than at boot,
 * where the only witness is a crash-looping supervisor.
 *
 * The entry boots the factory at module load (top-level `await
 * factory.prepare()` / `finalize()`). That boot reads deployment env, so
 * anything inherited from the operator's shell would configure it: `REDIS_URL`
 * makes it dial a Redis that need not exist (the gate hangs rather than fails),
 * and a malformed `FACTORY_CREDENTIAL_ENCRYPTION_KEY` aborts the import before a
 * single test runs. The preamble therefore sweeps away every variable that boot
 * consults — the entry itself now reads none of them: every read sits in a
 * `./config/` module, reached through `./config/factory`, and all of them are
 * evaluated as part of importing the entry — and sets only what the boot needs.
 * The sweep is mostly by prefix, so an env var added to one of those config
 * modules under one of the prefixes below is neutralized without anyone
 * remembering to update this file. The unprefixed names are listed exactly in
 * ENTRY_ENV_EXACT below and do have to be kept in step with the boot by hand.
 * Static `import` statements are evaluated before any module body statement, so
 * the entry is pulled in with `await import(...)` once that is arranged.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Every env var importing the entry reads — all of them in the `./config/`
// modules it pulls in through `./config/factory` — starts with one of these, or
// is named exactly below. Sweeping the whole space keeps an inherited value from
// configuring the boot; PATH/HOME and the rest of the shell are untouched.
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
// DOCKER_HOST is swept even though this boot never reads it and never builds a
// sandbox: `./config/sandbox` is imported for the slot it exports, and the slot
// is only called per session, which the gate never reaches. It stays swept
// because it is the one variable an inherited value could turn into a failure
// the moment that stops being true — a `DockerSandbox` constructed anywhere in
// this process makes docker-modem read DOCKER_HOST itself and throw on a value
// it cannot parse, and a sweep that is removed once is not put back. Keeping it
// costs one array element; `config/sandbox.test.ts`, which DOES construct
// sandboxes, sweeps the same key for the live version of this reason.
// BETTER_AUTH_SECRET matches none of the prefixes above and IS read by the boot,
// in `./config/auth`: inherited from a shell it would make the boot below
// construct a real self-managed auth provider before the test that deliberately
// arranges one, so the two boots would stop being distinguishable.
// REDIS_URL, DATABASE_URL and APP_DATABASE_URL are read in `./config/pubsub`
// and `./config/database-url` rather than in the entry, but they are read by
// importing the entry all the same — `./config/factory` pulls them in, and the
// entry pulls that in — so all three must stay swept here. Nothing about which
// file holds the read changes what an inherited value would do to this boot.
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
// The auth-wiring test below boots a SECOND instance of the entry, with
// BETTER_AUTH_SECRET set, to observe that booting it wires the selected provider
// into the factory. That boot gets its own file so it cannot migrate or lock the
// one above.
const selfManagedDbPath = join(tmpdir(), `mastra-factory-index-test-auth-${randomUUID()}.db`);

// libSQL leaves `.db`, `.db-wal` and `.db-shm` behind — about 1.8 MB per run.
// `npm test` is a verify-gate command, so without this they accumulate in the
// temp directory of every machine that ever runs the gate.
afterAll(() => {
  for (const path of [dbPath, selfManagedDbPath]) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
  }
});

await import('./index');

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
 * The one fact about auth that belongs to booting the entry rather than to
 * `./config/auth`: that the provider the module selected is the provider the
 * factory built in `./config/factory` was actually given, end to end.
 *
 * `config/auth.test.ts` covers the selection chain itself. Severing the wiring
 * — importing `auth` and then not passing it, or replacing the module-level
 * `const auth = selectAuth()` with `undefined` — leaves `tsc` clean and that
 * whole suite green while the deployment silently reverts to platform-hosted
 * identity. The only witness is the route the factory derives from the provider
 * it was handed: an `IAuthHttpHandler` (which the platform-backed default is
 * not) is what makes it mount better-auth's own HTTP surface at
 * `ALL /auth/api/*`. Hence a second boot of the entry, on its own database
 * file, with the secret set.
 */
describe('the entry wiring', () => {
  // Length is what a real deployment would use; the value is inert test data.
  const SECRET = 'x'.repeat(48);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('hands the selected auth provider to MastraFactory', async () => {
    vi.resetModules();
    vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
    vi.stubEnv('MASTRA_DB_PATH', selfManagedDbPath);

    const { mastra } = await import('./index');

    const authApi = mastra.getServer()?.apiRoutes?.find(route => route.path === '/auth/api/*');
    expect(authApi?.method).toBe('ALL');
  });
});
