/**
 * Tests for the entry's three pure helpers.
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
 * file. The three unprefixed names are listed exactly and do have to be kept in
 * step with the entry by hand.
 * Static `import` statements are evaluated before any module body statement, so
 * the entry is pulled in with `await import(...)` once that is arranged.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

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
const ENTRY_ENV_EXACT = ['REDIS_URL', 'DATABASE_URL', 'APP_DATABASE_URL'];

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

// libSQL leaves `.db`, `.db-wal` and `.db-shm` behind — about 1.8 MB per run.
// `npm test` is a verify-gate command, so without this they accumulate in the
// temp directory of every machine that ever runs the gate.
afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
});

const { LOCAL_SANDBOX_ENV_KEYS, decodeCredentialEncryptionKey, localSandboxEnv, positiveInt } = await import(
  './index'
);

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
