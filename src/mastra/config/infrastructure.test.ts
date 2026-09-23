/**
 * Which backend each of the three extracted concerns is, and with which options.
 *
 * That pairing is the whole of what Story 5.4 moved, and no other check in this
 * repository can see it: `tsc` is happy with either arm of either branch, and the
 * entry's own boot in `index.test.ts` only ever exercises the no-database arm,
 * because the verify gate has no Postgres and no Redis. So the Postgres pair, the
 * libSQL fallback, and the credential redaction in the Redis log are asserted
 * here or nowhere.
 *
 * The four backend packages are stubbed, deliberately and not as a convenience:
 * the question these modules answer is which class is constructed with which
 * options, and stubbing is what makes the options readable. It also keeps the
 * gate from dialling anything — `RedisStreamsPubSub` against a URL is how this
 * suite would hang rather than fail (see `../index.test.ts`).
 *
 * Environment is arranged with `vi.stubEnv`, never by assignment, so no key name
 * appears here as a literal `process.env` read: AD-7 counts those, and
 * `./database-url` and `./pubsub` are meant to be the only ones.
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
vi.mock('@mastra/redis-streams', () => ({
  RedisStreamsPubSub: class RedisStreamsPubSub extends StubBackend {},
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
async function loadStorage(env: { DATABASE_URL?: string; APP_DATABASE_URL?: string; NODE_ENV?: string }) {
  vi.stubEnv('DATABASE_URL', env.DATABASE_URL);
  vi.stubEnv('APP_DATABASE_URL', env.APP_DATABASE_URL);
  vi.stubEnv('NODE_ENV', env.NODE_ENV);
  vi.resetModules();
  const pg = await import('@mastra/pg');
  const libsql = await import('@mastra/libsql');
  const { storage } = await import('./storage');
  const { vector } = await import('./vector');
  return { ...pg, ...libsql, storage, vector };
}

async function loadPubsub(redisUrl: string | undefined) {
  vi.stubEnv('REDIS_URL', redisUrl);
  vi.resetModules();
  const { RedisStreamsPubSub } = await import('@mastra/redis-streams');
  const { pubsub } = await import('./pubsub');
  return { RedisStreamsPubSub, pubsub };
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

  it('ride the deprecated alias when it is the only database key set', async () => {
    // The two halves of this scenario are resolved in `./database-url` and
    // consumed here, so `database-url.test.ts` proving the alias wins does not
    // by itself prove the alias reaches a backend. A consumer that read
    // `DATABASE_URL` directly instead of importing the resolved value would pass
    // every other assertion in this file and drop the alias on the floor.
    const url = 'postgres://u:p@127.0.0.1:54329/legacy';

    const { PgFactoryStorage, PgVector, storage, vector } = await loadStorage({ APP_DATABASE_URL: url });

    expect(storage).toBeInstanceOf(PgFactoryStorage);
    expect(optionsOf(storage).connectionString).toBe(url);
    expect(vector).toBeInstanceOf(PgVector);
    expect(optionsOf(vector).connectionString).toBe(url);
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

describe('pubsub', () => {
  it('rides Redis Streams when REDIS_URL is set', async () => {
    const url = 'redis://someone:secret@127.0.0.1:6399';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { RedisStreamsPubSub, pubsub } = await loadPubsub(url);

    expect(pubsub).toBeInstanceOf(RedisStreamsPubSub);
    expect(optionsOf(pubsub)).toEqual({ url });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('redacts the credentials REDIS_URL may embed before logging it', async () => {
    // The log line is the only place this URL is ever printed, and it goes to a
    // file the rotation conf keeps on disk for a week.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loadPubsub('redis://someone:secret@127.0.0.1:6399');

    const message = String(log.mock.calls[0]?.[0]);
    expect(message).toContain('redis://127.0.0.1:6399');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('someone');
  });

  it('keeps the log generic for a URL it cannot parse', async () => {
    // The constructor will surface the real error; this line must not be the
    // thing that throws first, and must not echo an unparsed value either.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await loadPubsub('not a url');

    const message = String(log.mock.calls[0]?.[0]);
    expect(message).toContain('Redis Streams (redis)');
    expect(message).not.toContain('not a url');
  });

  it('leaves the in-process default in place when REDIS_URL is unset or empty', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    for (const value of [undefined, '']) {
      const { pubsub } = await loadPubsub(value);
      expect(pubsub).toBeUndefined();
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only REDIS_URL as configured, so a padded .env line dials a bus', async () => {
    // Pins today's behaviour rather than endorsing it. `pubsub.ts` is the one
    // module here whose untrimmed read is an oversight rather than a decision:
    // the other raw reads in this directory (`public-url.ts`, the Slack and
    // GitHub secrets and the channels URL in `integrations.ts`, the previous-keys
    // blob in `auth.ts`) each say in place why the value is passed on as given,
    // and this one does not. So `REDIS_URL="   "` is truthy, constructs a
    // RedisStreamsPubSub against an unparseable target and logs the generic
    // name, where the same padding on `DATABASE_URL` reads as absent. Story 5.4
    // moves this code without changing it, so the asymmetry moves with it and is
    // recorded as deferred work; the test makes adding the trim a visible edit
    // here rather than a silent behaviour change.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { RedisStreamsPubSub, pubsub } = await loadPubsub('   ');

    expect(pubsub).toBeInstanceOf(RedisStreamsPubSub);
    expect(optionsOf(pubsub)).toEqual({ url: '   ' });
    expect(String(log.mock.calls[0]?.[0])).toContain('Redis Streams (redis)');
  });
});
