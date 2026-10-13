/**
 * The database connection string, resolved once for every concern that needs it.
 *
 * `DATABASE_URL` and `NODE_ENV` are read HERE and nowhere else in first-party
 * code (AD-7). `storage.ts` and `vector.ts` both need the
 * same parsed value, and the question the `NODE_ENV` gate answers — is a
 * database REQUIRED in this mode — belongs to the connection string rather than
 * to either concern that consumes it, so the gate lives here too.
 *
 * See `README.md` in this directory for what the entry was forked from and how
 * these modules are reconciled with an upstream template update.
 */
import { env } from './env';

export const databaseUrl = env.DATABASE_URL?.trim() || undefined;

// Development and tests are the only modes allowed to boot with no connection
// string, falling back to the local libSQL file `storage.ts` resolves. Anywhere
// else a missing URL is a misconfiguration that must stop the boot rather than
// silently write a deployment's data to a file in the operator's home directory.
const nodeEnv = env.NODE_ENV;
const localDevelopmentMode = nodeEnv === 'development' || nodeEnv === 'test';
if (!databaseUrl && !localDevelopmentMode) {
  throw new Error('DATABASE_URL is required outside local development and tests.');
}
