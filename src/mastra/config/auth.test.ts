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

/**
 * The decoder's rejection sentence, whole, for a given variable name — the only
 * copy of it in this suite, held here rather than inside one `describe` because
 * both the helper block and the boot block compare against it.
 *
 * It is pinned in full, not by `/NAME/` substring, for the reason
 * `PREVIOUS_KEYS_SHAPE_ERROR` is: this is the entire migration instruction an
 * operator gets when a key that booted yesterday — spelled base64url, or
 * unpadded — stops booting today, and such a key cannot be regenerated without
 * stranding the ciphertext written under it. `README.md:44` quotes this
 * sentence verbatim as what the operator will see; if an edit here fails,
 * update that copy in the same change.
 */
const keyShapeError = (name: string) =>
  `${name} must be 43 standard-base64 characters followed by "=", as \`openssl rand -base64 32\` emits (see README.md). ` +
  'A base64url (`-`, `_`) or unpadded spelling is rejected even though it decodes to 32 bytes.';

describe('decodeCredentialEncryptionKey', () => {
  const validKey = Buffer.alloc(32, 7).toString('base64');

  it('decodes a well-formed base64 32-byte key', () => {
    const decoded = decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', validKey);
    expect(Buffer.isBuffer(decoded)).toBe(true);
    expect(decoded.byteLength).toBe(32);
    expect(decoded.equals(Buffer.alloc(32, 7))).toBe(true);
  });

  it('names the environment variable for a value that is not base64 at all', () => {
    // `Buffer.from` does not reject this; it skips the invalid characters and
    // yields 10 bytes. It is the shape check that rejects it — the length check
    // would too, which is exactly why the case below exists as well.
    expect(Buffer.from('not-a-real-key', 'base64').byteLength).toBe(10);
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', 'not-a-real-key')).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('rejects a value containing non-base64 characters even though it decodes to 32 bytes', () => {
    // The defect this suite used to pin. `Buffer.from` skips the `!` characters
    // and hands back a full 32 bytes, so a length-only check accepts a
    // typo-corrupted key and every stored credential then decrypts to garbage.
    // The measurement stays in the test as the reason the SHAPE check, not the
    // length check, is what has to do the rejecting here.
    const lenient = `!!!!${'A'.repeat(43)}`;
    expect(Buffer.from(lenient, 'base64').byteLength).toBe(32);
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', lenient)).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('rejects the base64url alphabet, which no documented way of making this key emits', () => {
    // `README.md:34` tells operators to run `openssl rand -base64 32`, which
    // emits STANDARD padded base64. The rejection is about PROVENANCE, not
    // bytes: Node maps `-`→62 and `_`→63, so these spellings decode to exactly
    // the bytes the standard spelling would — measured below as equality with
    // that spelling, because the rejection message's advice ("respell it")
    // is only safe advice if it is true. A `-` or `_` means the value did not
    // come from the documented command, so where it did come from is unknown.
    const spellings: [url: string, standard: string][] = [
      [`-${'A'.repeat(42)}=`, `+${'A'.repeat(42)}=`],
      [`${'A'.repeat(42)}_=`, `${'A'.repeat(42)}/=`],
    ];
    for (const [url, standard] of spellings) {
      expect(url).toHaveLength(44);
      expect(Buffer.from(url, 'base64').byteLength).toBe(32);
      expect(Buffer.from(url, 'base64').equals(Buffer.from(standard, 'base64'))).toBe(true);
      expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', url)).toThrow(
        /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
      );
    }
  });

  it('rejects an unpadded spelling, which is the half of the rule the `=` carries', () => {
    // The one input that isolates the trailing `=`: correct alphabet, correct
    // 43 characters, 32 bytes out, padding removed. Without it the regex can be
    // relaxed to `/^[A-Za-z0-9+/]{43}=?$/` with every other case still green —
    // the base64url pair fails on the alphabet, base64 of 31 bytes carries a
    // second `=` inside the 43-character run, and base64 of 33 bytes is 44
    // alphabet characters — leaving the code's accepted spelling wider than the
    // one the message and `README.md:44` publish.
    const unpadded = validKey.slice(0, 43);
    expect(unpadded).toHaveLength(43);
    expect(Buffer.from(unpadded, 'base64').byteLength).toBe(32);
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', unpadded)).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('states the accepted spelling in full, because that sentence is the whole migration note', () => {
    // Caught by hand rather than matched with `/FACTORY_CREDENTIAL_ENCRYPTION_KEY/`,
    // which every other case above uses: those all stay green if the sentence
    // is reverted to `${name} must contain base64-encoded 32-byte keys.`, which
    // tells an operator holding a base64url key — base64-encoded, 32 bytes —
    // nothing at all. See `keyShapeError` above for the README copy this pins.
    let thrown: unknown;
    try {
      decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', 'not-a-real-key');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(keyShapeError('FACTORY_CREDENTIAL_ENCRYPTION_KEY'));
  });

  it('does not trim: a padded value reaching the decoder is an error, because call sites trim', () => {
    // Every call site in `auth.ts` trims before calling, so whitespace arriving
    // here is not a padded `.env` line — it is a value with a space inside it.
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', `${validKey}\n`)).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
    expect(() => decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', ` ${validKey}`)).toThrow(
      /FACTORY_CREDENTIAL_ENCRYPTION_KEY/,
    );
  });

  it('names the environment variable for base64 of 31 or 33 bytes, which is the wrong spelling too', () => {
    // Neither of these reaches the `byteLength !== 32` branch: base64 of 31
    // bytes is 44 characters ending `==` and base64 of 33 bytes is 44
    // characters with no padding at all, so the shape check rejects both. The
    // wrong length and the wrong spelling arrive together — there is no
    // encoding of a non-32-byte buffer that matches 43 characters plus one `=`.
    const tooShort = Buffer.alloc(31, 7).toString('base64');
    const tooLong = Buffer.alloc(33, 7).toString('base64');
    expect(tooShort.endsWith('==')).toBe(true);
    expect(tooLong.includes('=')).toBe(false);
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

  it('refuses to load when the primary key is corrupt, naming that key', async () => {
    // The boot-surface half of the decoder case above. Without it the whole
    // shape check could be deleted from `credentialEncryption()`'s primary-key
    // call site — reverting it to a bare `Buffer.from(encodedKey, 'base64')` —
    // and every case in this block would stay green, because they all pass a
    // well-formed VALID_KEY. `/FACTORY_CREDENTIAL_ENCRYPTION_KEY/` does not
    // match `…_PREVIOUS_KEYS`, so it still discriminates between the two paths.
    let thrown: unknown;
    try {
      await load({ FACTORY_CREDENTIAL_ENCRYPTION_KEY: `!!!!${'A'.repeat(43)}` });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    // Whole sentence, not `/FACTORY_CREDENTIAL_ENCRYPTION_KEY/`: the boot is
    // where an operator actually meets this text, so this is the case that
    // proves what reaches them, name included.
    expect((thrown as Error).message).toBe(keyShapeError('FACTORY_CREDENTIAL_ENCRYPTION_KEY'));
  });

  it('trims the primary key, so a padded .env line still boots', async () => {
    // The `.trim()` at the read site became load-bearing with the shape check:
    // `Buffer.from` used to skip a trailing newline silently, so the trim was
    // belt-and-braces. Now the decoder rejects whitespace — the decoder block
    // above pins exactly that — so deleting the trim locks out every operator
    // whose `.env` line carries one, with no other test noticing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { secretEncryption } = await load({ FACTORY_CREDENTIAL_ENCRYPTION_KEY: `${VALID_KEY}\n` });

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

  it('reports unparseable previous-keys blobs with the same sentence, not a SyntaxError', async () => {
    // An unguarded `JSON.parse` takes the boot down with `SyntaxError: Expected
    // property name or '}' in JSON at position 1`, which names no environment
    // variable at all — the operator is left grepping for which of the dozens
    // of configured values was meant to be JSON. `' '` is the same defect
    // arriving as an apparently-blank line: it is non-empty, so it is parsed,
    // and `JSON.parse(' ')` throws `Unexpected end of JSON input`.
    for (const blob of ['{oops', ' ', 'not json at all', '{"v1": }']) {
      let thrown: unknown;
      try {
        await load({
          FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
          FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: blob,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(SyntaxError);
      expect((thrown as Error).message).toBe(PREVIOUS_KEYS_SHAPE_ERROR);
    }
  });

  it('reports a previous-keys blob of `null` with the same sentence', async () => {
    // Parses fine, so it reaches the shape guard rather than the catch — the
    // pair with `'[]'` above that proves both arms throw the one sentence.
    let thrown: unknown;
    try {
      await load({
        FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
        FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: 'null',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(PREVIOUS_KEYS_SHAPE_ERROR);
  });

  it('treats an empty previous-keys blob as no rotation in progress', async () => {
    // `''` must stay falsy-and-fine rather than becoming a parse failure: an
    // operator who left `FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS=` in .env
    // is not mid-rotation, and refusing to boot on that would be a regression
    // dressed as stricter validation.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { secretEncryption } = await load({
      FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
      FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: '',
    });

    expect(secretEncryption).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('trims previous-key values, so a rotation blob with a trailing newline still boots', async () => {
    // The primary key is trimmed at its read site, so a padded `.env` line has
    // always worked for it. Before this, the same paste inside a rotation blob
    // failed — and only during a rotation, which is the worst moment to find
    // out. The ids are deliberately NOT trimmed: an id must keep matching what
    // was recorded alongside the existing ciphertext.
    const { secretEncryption } = await load({
      FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
      FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID: 'v2',
      FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
        v1: `${Buffer.alloc(32, 3).toString('base64')}\n`,
      }),
    });

    expect(secretEncryption).toBeDefined();
  });

  it('names the previous-keys variable when one of its values is corrupt', async () => {
    // Decodes to a full 32 bytes through `Buffer.from`'s lenient skipping, so
    // only the shape check catches it — and the message must accuse the
    // rotation blob, not FACTORY_CREDENTIAL_ENCRYPTION_KEY, which is fine.
    //
    // The name it accuses is the ENTRY, not the bare variable: the sentence
    // says "must be 43 standard-base64 characters", which is false of a
    // variable that must be a JSON object — the other sentence thrown about
    // this same name says exactly that — and a real rotation blob can hold
    // more than one old key, only one of which is the bad one.
    let thrown: unknown;
    try {
      await load({
        FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
        FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID: 'v3',
        FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
          v1: Buffer.alloc(32, 3).toString('base64'),
          v2: `!!!!${'A'.repeat(43)}`,
        }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS/);
    expect((thrown as Error).message).toBe(keyShapeError('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS["v2"]'));
  });

  it('names the previous-keys variable when one of its values is not a string', async () => {
    let thrown: unknown;
    try {
      await load({
        FACTORY_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY,
        FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({ v1: 1 }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS values must be base64 strings.');
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
