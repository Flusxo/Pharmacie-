/**
 * Read-only export of the app database (DATABASE_URL, e.g. Neon) to backups/<timestamp>/: one JSON file per table
 * plus a manifest (row counts, applied migrations). Nothing is written to the database (READ ONLY transaction).
 * It is a data export for safety before a migration, not a pg_dump: the schema lives in db/migrations.
 * The folder is git-ignored. Never prints the connection string.
 *   npx tsx db/scripts/backup.ts            export
 *   npx tsx db/scripts/backup.ts --pending  only list the migrations not applied yet
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, databaseUrl } from '../src/env.js';
import { isLocalUrl, pgConfig, safeHost } from '../src/pgconfig.js';

const url = databaseUrl();
const client = new pg.Client(pgConfig(url));
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const files = fs
    .readdirSync(path.join(ROOT, 'db', 'migrations'))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const hasTable = (await client.query("SELECT to_regclass('public.schema_migrations') AS t")).rows[0].t !== null;
  const applied: string[] = hasTable
    ? (await client.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name)
    : [];
  const pending = files.filter((f) => !applied.includes(f));
  console.log(`[backup] database: ${isLocalUrl(url) ? 'local' : 'hosted'} (${safeHost(url)})`);
  console.log(`[backup] applied migrations: ${applied.join(', ') || 'none'}`);
  console.log(`[backup] PENDING migrations: ${pending.join(', ') || 'none'}`);
  if (process.argv.includes('--pending')) {
    await client.query('ROLLBACK');
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const tables: string[] = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map(
    (r) => r.tablename,
  );
  const manifest: Record<string, unknown> = { createdAt: new Date().toISOString(), applied, pending, rows: {} as Record<string, number> };
  let bytes = 0;
  for (const t of tables) {
    const r = await client.query(`SELECT * FROM "${t}"`);
    const file = path.join(dir, `${t}.json`);
    fs.writeFileSync(file, JSON.stringify(r.rows));
    bytes += fs.statSync(file).size;
    (manifest.rows as Record<string, number>)[t] = r.rowCount ?? 0;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await client.query('ROLLBACK');
  console.log(`[backup] folder: ${dir}`);
  console.log(`[backup] ${tables.length} tables, ${(bytes / 1024).toFixed(0)} KiB`);
  for (const k of ['users', 'medicines', 'pharmacy_inventory', 'orders', 'requests']) {
    console.log(`[backup]   ${k}: ${(manifest.rows as Record<string, number>)[k] ?? 'missing'} rows`);
  }
} finally {
  await client.end();
}
