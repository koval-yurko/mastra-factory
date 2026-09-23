/**
 * The database connection string, resolved once for every concern that needs it.
 *
 * `DATABASE_URL`, `APP_DATABASE_URL` and `NODE_ENV` are read HERE and nowhere
 * else in first-party code (AD-7). `storage.ts` and `vector.ts` both need the
 * same parsed value, and the question the `NODE_ENV` gate answers — is a
 * database REQUIRED in this mode — belongs to the connection string rather than
 * to either concern that consumes it, so the gate lives here too.
 *
 * See `README.md` in this directory for what the entry was forked from and how
 * these modules are reconciled with an upstream template update.
 */

// `APP_DATABASE_URL` is the deprecated legacy name — still honored as a
// fallback so existing checkouts keep working, but new setups should use
// `DATABASE_URL` (matches the platform's managed env-var sync for attached
// databases, so `mastra deploy` populates it automatically).
//
// Each key is read into a local ONCE, and both things that need it — the
// `databaseUrl` export below and the deprecation check under it — read the
// local rather than the environment. The entry read both keys twice, once to
// resolve and once to decide whether to warn, which is the duplication AD-7
// exists to forbid.
const primaryDatabaseUrl = process.env.DATABASE_URL?.trim() || undefined;
const legacyDatabaseUrl = process.env.APP_DATABASE_URL?.trim() || undefined;

export const databaseUrl = primaryDatabaseUrl || legacyDatabaseUrl;

if (legacyDatabaseUrl && !primaryDatabaseUrl) {
  console.warn(
    '[mastracode-web] APP_DATABASE_URL is deprecated — rename it to DATABASE_URL. ' +
      'The old name is honored as a fallback for now, but new deploys should use DATABASE_URL.',
  );
}

// Development and tests are the only modes allowed to boot with no connection
// string, falling back to the local libSQL file `storage.ts` resolves. Anywhere
// else a missing URL is a misconfiguration that must stop the boot rather than
// silently write a deployment's data to a file in the operator's home directory.
const nodeEnv = process.env.NODE_ENV;
const localDevelopmentMode = nodeEnv === 'development' || nodeEnv === 'test';
if (!databaseUrl && !localDevelopmentMode) {
  throw new Error('DATABASE_URL is required outside local development and tests.');
}
