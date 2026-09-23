/**
 * The vector store recall search runs against.
 *
 * It rides the SAME database as `./storage`, on the same connection string from
 * `./database-url` — which is why the string is resolved in its own module
 * rather than exported from either consumer (AD-7). With no connection string
 * (bare local dev) there is no vector store and the factory leaves the slot
 * empty, exactly as before extraction.
 *
 * Imported as a finished value by `./factory`. See `README.md` in this
 * directory.
 */
import { PgVector } from '@mastra/pg';
import { databaseUrl } from './database-url';

export const vector = databaseUrl
  ? new PgVector({ id: 'mastra-code-vectors', connectionString: databaseUrl })
  : undefined;
