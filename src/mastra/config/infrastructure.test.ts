/**
 * Which backend each of the two extracted infrastructure concerns is, and with
 * which options.
 *
 * That pairing is the whole of what the extraction moved, and no other check in this
 * repository can see it: `tsc` is happy with either arm of either branch, and the
 * entry's own boot in `index.test.ts` only ever exercises the no-database arm,
 * because the test run has no Postgres. So the Postgres pair and the libSQL
 * fallback are asserted here or nowhere.
 *
 * The three backend packages are stubbed, deliberately and not as a convenience:
 * the question these modules answer is which class is constructed with which
 * options, and stubbing is what makes the options readable. It also keeps the
 * gate from dialling anything.
 *
 * Environment is arranged with `vi.stubEnv`, never by assignment, so no key name
 * appears here as a literal `process.env` read: `./env` is meant to be the only
 * one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because `vi.mock` calls are lifted above the module body: the
// stub base class and the retention sentinel have to exist before any factory
// below can run.
const { StubBackend, RETENTION } = vi.hoisted(() => ({
  /** Records its options so a test can read back what the module passed. */
  StubBackend: class StubBackend {
    readonly options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  },
  // A sentinel rather than the real value: what matters is that the SAME
  // retention policy the SDK exports reaches both storage arms, not what is in it.
  RETENTION: { stub: 'DEFAULT_RETENTION' },
}));

vi.mock('@mastra/pg', () => ({
  PgFactoryStorage: class PgFactoryStorage extends StubBackend {},
  PgVector: class PgVector extends StubBackend {},
}));
vi.mock('@mastra/libsql', () => ({
  LibSQLFactoryStorage: class LibSQLFactoryStorage extends StubBackend {},
}));
vi.mock('@mastra/code-sdk/utils/project', () => ({
  getDatabasePath: () => '/stub/mastracode/mastra.db',
}));
vi.mock('@mastra/code-sdk/utils/storage-maintenance', () => ({ DEFAULT_RETENTION: RETENTION }));

/** Options of a stubbed backend, which its real declared type does not carry. */
function optionsOf(instance: unknown): Record<string, unknown> {
  return (instance as InstanceType<typeof StubBackend>).options;
}

/**
 * Import the storage/vector pair fresh. The stubbed packages are imported in the
 * SAME generation as the modules under test, because `vi.resetModules()` re-runs
 * the mock factories and an `instanceof` across two generations would compare
 * against a different class object.
 */
async function loadStorage(env: { DATABASE_URL?: string; NODE_ENV?: string }) {
  vi.stubEnv('DATABASE_URL', env.DATABASE_URL);
  vi.stubEnv('NODE_ENV', env.NODE_ENV);
  vi.resetModules();
  const pg = await import('@mastra/pg');
  const libsql = await import('@mastra/libsql');
  const { storage } = await import('./storage');
  const { vector } = await import('./vector');
  return { ...pg, ...libsql, storage, vector };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('storage and vector', () => {
  it('put both on the configured Postgres database', async () => {
    const url = 'postgres://u:p@127.0.0.1:54329/app';

    const { PgFactoryStorage, PgVector, storage, vector } = await loadStorage({ DATABASE_URL: url });

    expect(storage).toBeInstanceOf(PgFactoryStorage);
    expect(optionsOf(storage)).toEqual({
      id: 'mastra-code-storage',
      connectionString: url,
      retention: RETENTION,
    });
    // The pair is the point: recall search rides the SAME database as the app
    // tables, so a vector store on a different connection string would split
    // agent state across two databases with nothing reporting it.
    expect(vector).toBeInstanceOf(PgVector);
    expect(optionsOf(vector)).toEqual({ id: 'mastra-code-vectors', connectionString: url });
  });

  it('fall back to the local libSQL file with no database configured', async () => {
    const { LibSQLFactoryStorage, storage, vector } = await loadStorage({ NODE_ENV: 'test' });

    expect(storage).toBeInstanceOf(LibSQLFactoryStorage);
    expect(optionsOf(storage)).toEqual({
      id: 'mastra-code-storage',
      // The SDK's own resolution, so bare local dev opens the same file the
      // Mastra Code CLI does rather than a second, divergent database.
      url: 'file:/stub/mastracode/mastra.db',
      retention: RETENTION,
    });
    // No vector store, not an empty one: `@mastra/pg` is the only vector backend
    // installed, and it has no database to ride.
    expect(vector).toBeUndefined();
  });

  it('carry the same retention policy on both arms', async () => {
    // Retention is what bounds the growth of the only copy of this deployment's
    // data. An arm that dropped it would typecheck and keep everything forever.
    const pg = await loadStorage({ DATABASE_URL: 'postgres://u:p@127.0.0.1:54329/app' });
    const libsql = await loadStorage({ NODE_ENV: 'test' });

    expect(optionsOf(pg.storage).retention).toBe(RETENTION);
    expect(optionsOf(libsql.storage).retention).toBe(RETENTION);
  });
});

