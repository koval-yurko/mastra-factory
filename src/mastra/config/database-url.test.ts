/**
 * The connection-string resolution Story 5.4 lifted out of the entry.
 *
 * Two things here are load-bearing and neither is visible to `tsc`: how the
 * value is trimmed, and whether a deployment with no database refuses to boot
 * outside development and tests. The second one is a `throw` at module load — the difference between a supervisor
 * crash-looping with a named cause and a production deployment quietly writing
 * its only copy of every project, work item and token to a libSQL file in the
 * operator's home directory.
 *
 * The module has a side effect at load (it throws), so every case
 * arranges the environment first and then imports it fresh through
 * `vi.resetModules()`. Keys are set with `vi.stubEnv` rather than assigned, so
 * no key name appears here as a literal `process.env` read — AD-7 counts those,
 * and `./env` is meant to be the only one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The operator-facing string, written out in FULL rather than matched by a
// substring, so no part of it can change with this suite green.
const MISSING_DATABASE_ERROR = 'DATABASE_URL is required outside local development and tests.';

/** Every key this module reads, so an inherited value cannot configure a case. */
interface Env {
  DATABASE_URL?: string;
  NODE_ENV?: string;
}

async function load(env: Env) {
  vi.stubEnv('DATABASE_URL', env.DATABASE_URL);
  vi.stubEnv('NODE_ENV', env.NODE_ENV);
  vi.resetModules();
  return import('./database-url');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('databaseUrl', () => {
  it('resolves the configured Postgres URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { databaseUrl } = await load({ DATABASE_URL: 'postgres://u:p@127.0.0.1:54329/app' });

    expect(databaseUrl).toBe('postgres://u:p@127.0.0.1:54329/app');
    expect(warn).not.toHaveBeenCalled();
  });

  it('trims the value, so a padded .env line still names a database', async () => {
    const { databaseUrl } = await load({ DATABASE_URL: '  postgres://u:p@127.0.0.1:54329/app  ' });

    expect(databaseUrl).toBe('postgres://u:p@127.0.0.1:54329/app');
  });

  it('treats a blank or whitespace value as absent', async () => {
    for (const value of ['', '   ']) {
      const { databaseUrl } = await load({ DATABASE_URL: value, NODE_ENV: 'test' });
      expect(databaseUrl).toBeUndefined();
    }
  });
});

describe('the production database requirement', () => {
  it('lets development and tests boot with no database configured', async () => {
    for (const mode of ['development', 'test']) {
      const { databaseUrl } = await load({ NODE_ENV: mode });
      expect(databaseUrl).toBeUndefined();
    }
  });

  it('refuses to load with no database in any other mode, naming the key', async () => {
    // `undefined` is in this list deliberately: an unset NODE_ENV is NOT local
    // development. A regression that treated it as such would let the real
    // deployment — whose NODE_ENV comes from the LaunchAgent, not from .env —
    // silently fall back to a local file if that variable were ever dropped.
    for (const mode of ['production', 'staging', undefined]) {
      // Caught by hand rather than with `rejects.toThrow`, which matches a
      // SUBSTRING of the message: the sentence has to be pinned whole, because
      // it is the entire diagnosis an operator gets out of a crash-looping
      // supervisor log, and half of it still passes a substring match.
      const failure = await load({ NODE_ENV: mode }).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(MISSING_DATABASE_ERROR);
    }
  });
});
