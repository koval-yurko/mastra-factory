/**
 * Which identity provider this deployment runs on, and the credential
 * encryption that decision gates.
 *
 * Imported as finished values by `./factory`, which is what fixes this module's
 * position in the boot sequence — import order there is the evaluation order,
 * and this module runs after the three upstream infrastructure concerns and
 * before `./integrations`. Both of its load-time side effects live here: the
 * warning that a configured `BETTER_AUTH_SECRET` is being ignored, and the
 * warning that stored credentials will be persisted as plaintext.
 *
 * `secretEncryption` travels with the provider rather than standing alone
 * because it is not independently computable: it is `undefined` exactly when
 * `auth` is `null`, which is the auth chain's own decision that an explicitly
 * disabled deployment stores nothing encrypted (`docs/self-hosting-research.md`
 * §3.3 records it that way). Splitting it out would put half of one concern's
 * decision logic in each file.
 *
 * This module is the one first-party read site for every key below (AD-7). See
 * `README.md` in this directory.
 */
import { MastraAuthBetterAuth } from '@mastra/auth-better-auth';
import { createFactorySecretEncryption } from '@mastra/factory';
import type { IMastraAuthProvider } from '@mastra/core/server';

/**
 * Decode a base64 32-byte credential-encryption key. `name` is the environment
 * variable the value came from and is carried into the failure message, so a
 * boot failure points at the key rather than at the decoder.
 *
 * Exported for `auth.test.ts` only — nothing else imports it.
 */
export function decodeCredentialEncryptionKey(name: string, encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.byteLength !== 32) throw new Error(`${name} must contain base64-encoded 32-byte keys.`);
  return key;
}

function credentialEncryption() {
  const encodedKey = process.env.FACTORY_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encodedKey) {
    console.warn(
      '[factory] FACTORY_CREDENTIAL_ENCRYPTION_KEY is not set. Stored model-provider keys, custom-provider ' +
        'API keys, and integration secrets will be persisted as plaintext. Generate a key with ' +
        '`openssl rand -base64 32` and set FACTORY_CREDENTIAL_ENCRYPTION_KEY to encrypt them at rest.',
    );
    return undefined;
  }

  // Read ONCE into a local, which the truthiness test and the parse below both
  // use. The entry read this key twice — once to decide whether there was
  // anything to parse and once to parse it — which is the duplication AD-7
  // exists to forbid.
  const encodedPreviousKeys = process.env.FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS;
  const previousKeys: Record<string, unknown> = encodedPreviousKeys ? JSON.parse(encodedPreviousKeys) : {};
  if (!previousKeys || Array.isArray(previousKeys) || typeof previousKeys !== 'object') {
    throw new Error('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of key ids to base64 keys.');
  }

  return createFactorySecretEncryption({
    primary: {
      id: process.env.FACTORY_CREDENTIAL_ENCRYPTION_KEY_ID?.trim() || 'v1',
      key: decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_KEY', encodedKey),
    },
    previous: Object.entries(previousKeys).map(([id, value]) => {
      if (typeof value !== 'string') {
        throw new Error('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS values must be base64 strings.');
      }
      return { id, key: decodeCredentialEncryptionKey('FACTORY_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS', value) };
    }),
  });
}

/**
 * Auth selection, ordered by how explicit the operator's intent is:
 *   1. MASTRACODE_AUTH_DISABLED=1 — explicit opt-out, auth off entirely.
 *   2. MASTRA_SHARED_API_URL — explicit platform deferral; identity rides the
 *      shared platform API (`.env.schema` names this the highest-precedence
 *      auth config), so it wins even over a configured BETTER_AUTH_SECRET —
 *      but loudly, because silently ignoring sign-in config is how self-hosted
 *      logins end up 302-ing somewhere that rejects their redirect_uri.
 *   3. BETTER_AUTH_SECRET — self-managed sign-in this deployment owns, with no
 *      external identity provider in the path. The provider is constructed in
 *      DEFERRED-INSTANCE mode (a `secret`, no `auth` instance): `MastraFactory`
 *      calls `init()` with the auth-database handle `FactoryStorage` exposes,
 *      so the provider builds its own Better Auth instance on the SAME database
 *      and connection string as the app tables (`DATABASE_URL`, or the local
 *      libSQL file in bare dev), owns its migrations — lazily, on first
 *      request, never at boot — and registers the organization plugin itself,
 *      which is what gives org-scoped features a real org without a hosted IdP.
 *      Nothing is passed here for the database or the browser-facing origin:
 *      `init()` takes the handle from the host and derives the origin from the
 *      factory's `publicUrl` (MASTRACODE_PUBLIC_URL, read in `./public-url` and
 *      wired in `./factory`), and a bring-your-own `auth` instance would skip
 *      the plugin, the migrations and the `/auth/api` base path entirely.
 *      Note MASTRA_PLATFORM_ACCESS_TOKEN / MASTRA_PLATFORM_SECRET_KEY do NOT
 *      defer to the platform here: they are compute/integration credentials
 *      (sandboxes, GitHub/Linear slots), not identity signals — platform
 *      compute plus self-managed sign-in is a supported combination.
 *   4. Nothing configured — leave undefined and MastraFactory installs its
 *      platform-backed default provider: `MastraAuthStudio`, which verifies
 *      identity against https://platform.mastra.ai. That is a third party in
 *      the sign-in path, and it is where a typo in BETTER_AUTH_SECRET's name
 *      lands silently — so deleting or reordering an arm above is not a
 *      failed sign-in, it is a working sign-in somewhere else.
 *
 * The chain is a function rather than module-level `if`/`else` because the
 * ORDER is the guarantee — that a stray MASTRA_SHARED_API_URL still wins, and
 * that nothing else does — and `vitest` cannot observe statements. Same reason
 * `selectSandbox` in `./sandbox` is exported.
 *
 * Exported for `auth.test.ts` only — nothing else imports it.
 */
export function selectAuth(): IMastraAuthProvider | null | undefined {
  if (process.env.MASTRACODE_AUTH_DISABLED === '1') return null;

  // A blank secret must never reach the constructor: `new MastraAuthBetterAuth({})`
  // throws ("Better Auth instance is required…") at module load, taking the whole
  // deployment down at boot with a message that names the wrong cause for an
  // operator who simply forgot the key. So gate on a trimmed, non-empty value and
  // otherwise fall through — exactly as an unconfigured WorkOS group did before.
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (process.env.MASTRA_SHARED_API_URL?.trim()) {
    if (betterAuthSecret) {
      console.warn(
        '[Auth] BETTER_AUTH_SECRET is set but ignored: MASTRA_SHARED_API_URL takes precedence, so sign-in defers to the platform. Unset MASTRA_SHARED_API_URL to use self-managed Better Auth sign-in.',
      );
    }
    return undefined;
  }

  if (betterAuthSecret) {
    return new MastraAuthBetterAuth({
      secret: betterAuthSecret,
      // Registration is CLOSED: no one can create an account against this
      // deployment, whoever reaches the sign-in page. This line is the whole
      // switch, and it is written out rather than omitted because the package
      // default is the opposite — `options.signUpEnabled ?? true` — so deleting
      // it silently reopens sign-up with a diff that never mentions sign-up.
      // It is deliberately NOT read from the environment: the guarantee is that
      // no `.env` value, stray export or bad deploy config can reopen
      // registration, so there is no key to set and nothing here to override.
      // To add a second account, open this file, set the field to `true`,
      // restart the server, create the account, set it back to `false` and
      // restart again — a reviewable edit and a restart, on purpose, twice.
      signUpEnabled: false,
      // `MastraAuthBetterAuthOptions` is declared but not exported by the
      // package, so the option type is named inline through the constructor
      // rather than imported. It documents the shape; it does not enforce
      // deferred-instance mode. `auth?` is a legal option on this type, so
      // adding an `auth:` instance here would typecheck while skipping the
      // organization plugin, the migrations and the `/auth/api` base path.
      // Only review keeps that out.
    } satisfies ConstructorParameters<typeof MastraAuthBetterAuth>[0]);
  }

  return undefined;
}

export const auth = selectAuth();
export const secretEncryption = auth === null ? undefined : credentialEncryption();
