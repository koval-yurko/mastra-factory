/**
 * The identity-provider chain and the credential-key decoder Story 5.5 lifted
 * out of the entry.
 *
 * These assertions moved here unchanged from `../index.test.ts`. What they pin
 * is the branch ORDER of `selectAuth`, which nothing else in the repository can
 * see: reordering the arms leaves `tsc` clean and every other test green while
 * either handing identity to a third party that a stray MASTRA_SHARED_API_URL
 * names, or overriding an operator's deliberate platform deferral. The entry's
 * own test keeps the other half — that the value this module exports is the one
 * the factory is actually handed — because that is a fact about the entry.
 *
 * The other thing asserted here is that a blank secret never reaches the
 * constructor. `new MastraAuthBetterAuth({})` throws at module load, so a
 * regression there is not a failed sign-in — it is a deployment that will not
 * boot, with an error message naming a missing `auth` instance rather than the
 * unset key the operator actually forgot.
 *
 * The module has side effects at load (`auth` and `secretEncryption` are
 * evaluated there, and the latter warns when no encryption key is set), so the
 * preamble below sweeps the environment BEFORE the dynamic import, exactly as
 * `../index.test.ts` does and for the same reason: these blocks arrange each
 * case with `vi.stubEnv` rather than stubbing every key exhaustively, so an
 * inherited `BETTER_AUTH_SECRET` or a malformed inherited
 * `FACTORY_CREDENTIAL_ENCRYPTION_KEY` would configure — or abort — the import
 * before a single test ran. Keys are set with `vi.stubEnv` and never assigned,
 * so no key name appears here as a literal `process.env` read, which the verify
 * gate counts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Every env var importing this module reads starts with one of these, or is
// named exactly below. Sweeping the whole space keeps an inherited value from
// configuring the import; PATH/HOME and the rest of the shell are untouched.
// The prefix list is the entry's, not a narrower one: it costs nothing and a
// key added to this module under one of them is neutralized without anyone
// remembering to come back here.
const CONFIG_ENV_PREFIXES = ['FACTORY_', 'MASTRA_', 'MASTRACODE_', 'WORKOS_', 'GITHUB_APP_', 'LINEAR_', 'SLACK_APP_'];
// BETTER_AUTH_SECRET matches none of the prefixes above and is the key this
// module's third arm turns on: inherited from a shell it would make the import
// construct a real self-managed provider, and every fall-through case below
// would then see a configured deployment.
const CONFIG_ENV_EXACT = ['BETTER_AUTH_SECRET'];

for (const key of Object.keys(process.env)) {
  if (CONFIG_ENV_PREFIXES.some(prefix => key.startsWith(prefix)) || CONFIG_ENV_EXACT.includes(key)) {
    delete process.env[key];
  }
}

// Static `import` statements are evaluated before any module body statement, so
// the module under test is pulled in with `await import(...)` once the sweep
// above has run.
const { decodeCredentialEncryptionKey, selectAuth } = await import('./auth');
// Deferred for symmetry with the module under test; the provider package reads
// no environment of its own. It must come from the same generation as the
// module above, or the `instanceof` comparisons below compare against a second
// copy of the class — which is why neither import is preceded by a
// `vi.resetModules()`.
const { MastraAuthBetterAuth } = await import('@mastra/auth-better-auth');

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

/**
 * The chain itself: one case per arm, in the order the arms are written, plus
 * the trimming each one does. The cases that pair two arms against each other
 * are the ones that see the ORDER the file docstring above is about — a stray
 * platform URL beating a configured secret, and the explicit opt-out beating
 * both.
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
});

/**
 * The half of this module that is not `selectAuth`: `secretEncryption` is
 * `undefined` exactly when `auth` is `null`, and the previous-keys blob is
 * validated before any of it is decoded.
 *
 * Both are load-time behaviour of the module rather than of an exported
 * function — `credentialEncryption` is private and is called once, at import —
 * so each case arranges the environment and then imports the module fresh.
 * Neither is visible anywhere else: `tsc` accepts a `secretEncryption` computed
 * without the `auth === null` gate, and a deployment that silently encrypted
 * nothing, or that threw a decoder error instead of naming the malformed key,
 * would look identical to every other check in this repository.
 */
describe('secretEncryption', () => {
  /** Every key the module reads, so an inherited value cannot configure a case. */
  interface Env {
    MASTRACODE_AUTH_DISABLED?: string;
    MASTRA_SHARED_API_URL?: string;
    BETTER_AUTH_SECRET?: string;
    FACTORY_CREDENTIAL_ENCRYPTION_KEY?: string;
    FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID?: string;
    FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS?: string;
  }

  const ENV_KEYS: (keyof Env)[] = [
    'MASTRACODE_AUTH_DISABLED',
    'MASTRA_SHARED_API_URL',
    'BETTER_AUTH_SECRET',
    'FACTORY_CREDENTIAL_ENCRYPTION_KEY',
    'FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID',
    'FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS',
  ];

  /** A well-formed base64 32-byte key. Inert test data, not a real credential. */
  const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

  const PREVIOUS_KEYS_SHAPE_ERROR =
    'FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of key ids to base64 keys.';

  async function load(env: Env) {
    for (const key of ENV_KEYS) vi.stubEnv(key, env[key]);
    vi.resetModules();
    return import('./auth');
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is undefined when auth is disabled, even with a valid encryption key configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { auth, secretEncryption } = await load({
      MASTRACODE_AUTH_DISABLED: '1',
      FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
    });

    // The key is valid and present, so an ungated `credentialEncryption()`
    // would have returned a real encryption object here. `undefined` is the
    // proof that the `auth === null` gate held: an explicitly disabled
    // deployment stores nothing encrypted, and that decision belongs to the
    // auth chain rather than to the encryption code.
    expect(auth).toBeNull();
    expect(secretEncryption).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns that credentials will be stored as plaintext when no key is set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { secretEncryption } = await load({});

    // The noisy baseline every `not.toHaveBeenCalled()` in this block is
    // measured against. Without it, deleting the whole warning from
    // `credentialEncryption()` would leave this suite green and a deployment
    // would persist model-provider keys and integration secrets as plaintext
    // with nothing said about it — the silence assertions would all still pass,
    // because silence is what they ask for.
    expect(secretEncryption).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/FACTORY_CREDENTIAL_ENCRYPTION_KEY is not set/);
  });

  it('does not even warn about plaintext credentials when auth is disabled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { secretEncryption } = await load({ MASTRACODE_AUTH_DISABLED: '1' });

    // With auth enabled and no key set this import warns that stored
    // credentials will be persisted as plaintext — the case above pins that.
    // Silence here is the sharper proof that the key was never read at all.
    expect(secretEncryption).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('builds an encryption object when a key is configured and auth is not disabled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { secretEncryption } = await load({ FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY });

    expect(secretEncryption).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses to load when the previous-keys blob is not a JSON object, naming the key', async () => {
    // Caught by hand rather than through `rejects.toThrow`, which matches a
    // substring: this sentence is what an operator sees when a key rotation is
    // written as an array, and the whole of it has to survive an edit here.
    let thrown: unknown;
    try {
      await load({
        FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
        FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: '[]',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(PREVIOUS_KEYS_SHAPE_ERROR);
  });

  it('decodes a well-formed previous-keys map', async () => {
    const { secretEncryption } = await load({
      FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
      FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID: 'v2',
      FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 3).toString('base64') }),
    });

    expect(secretEncryption).toBeDefined();
  });
});
