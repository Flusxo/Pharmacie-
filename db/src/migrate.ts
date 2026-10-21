import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT } from './env.js';

const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

/** Applies every numbered .sql file once, in order, each in its own transaction. */
export async function migrate(client: pg.ClientBase): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rowCount) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  return applied;
}
