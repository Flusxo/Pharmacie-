import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Put your Neon connection string in the root .env (see .env.example).');
  }
  return url;
}

/** Bundled PostgreSQL is only ever started for localhost URLs. */
export const embeddedEnabled = (): boolean => (process.env.EMBEDDED_PG ?? 'true').toLowerCase() === 'true';

/** Tests never touch DATABASE_URL: they use TEST_DATABASE_URL, or the bundled PostgreSQL by default. */
export const DEFAULT_TEST_DATABASE_URL = 'postgres://pharmalink:pharmalink@localhost:5433/pharmalink_test';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL: the tests wipe their database.');
  }
  return url;
}
