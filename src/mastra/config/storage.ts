/**
 * The `FactoryStorage` backend the deployment runs on.
 *
 * Imported as a finished instance by `./factory`; the connection string arrives
 * from `./database-url`, which is the one place the keys behind it are read
 * (AD-7). See `README.md` in this directory.
 */
import { LibSQLFactoryStorage } from '@mastra/libsql';
import { PgFactoryStorage } from '@mastra/pg';
import { getDatabasePath } from '@mastra/code-sdk/utils/project';
import { DEFAULT_RETENTION } from '@mastra/code-sdk/utils/storage-maintenance';
import { databaseUrl } from './database-url';

// One FactoryStorage backend powers agent storage, the factory app tables,
// the distributed project lock, and better-auth. `DATABASE_URL` set →
// Postgres (the paired PgVector rides the same database for recall search).
// Unset (bare local dev) → libSQL on the same local file the SDK's default
// storage resolution uses, running the FULL app surface (auth, intake,
// audit, work-items, integrations) — no features silently off.
export const storage = databaseUrl
  ? new PgFactoryStorage({
      id: 'mastra-code-storage',
      connectionString: databaseUrl,
      retention: DEFAULT_RETENTION,
    })
  : new LibSQLFactoryStorage({
      id: 'mastra-code-storage',
      url: `file:${getDatabasePath()}`,
      retention: DEFAULT_RETENTION,
    });
