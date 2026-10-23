// Read-only check after a migration: the new tables exist and the row counts equal the latest backup.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, databaseUrl } from '../src/env.js';
import { pgConfig } from '../src/pgconfig.js';

const dirs = fs.readdirSync(path.join(ROOT, 'backups')).sort();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'backups', dirs.at(-1)!, 'manifest.json'), 'utf8'));
const c = new pg.Client(pgConfig(databaseUrl()));
await c.connect();
await c.query('BEGIN READ ONLY');
for (const t of ['payments', 'stripe_events']) {
  const r = await c.query('SELECT to_regclass($1) AS t', [`public.${t}`]);
  console.log(`${t}: ${r.rows[0].t ? 'exists' : 'MISSING'}`);
}
let same = true;
for (const [t, n] of Object.entries(manifest.rows as Record<string, number>)) {
  const r = await c.query(`SELECT count(*)::int AS n FROM "${t}"`);
  if (r.rows[0].n !== n) {
    same = false;
    console.log(`DIFFERENT ${t}: backup ${n}, now ${r.rows[0].n}`);
  }
}
console.log(same ? 'all backed-up tables have the same row counts as the backup' : 'row counts differ (see above)');
await c.query('ROLLBACK');
await c.end();
