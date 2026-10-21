import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Run `cp .env.example .env` at the repository root first.');
  }
  return url;
}

export const embeddedEnabled = (): boolean => (process.env.EMBEDDED_PG ?? 'true').toLowerCase() === 'true';
