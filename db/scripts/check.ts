import pg from 'pg';
import { databaseUrl, ensurePostgres } from '../src/index.js';

const url = databaseUrl();
const h = await ensurePostgres(url);
const c = new pg.Client({ connectionString: url });
await c.connect();
const ext = await c.query(`SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','unaccent','pg_trgm') ORDER BY 1`);
console.log('extensions:', ext.rows.map((r) => r.extname).join(', '));
for (const q of ['dolliprane', 'PARA', 'cetirizine', 'éfferalgan']) {
  const r = await c.query(
    `SELECT name, round(greatest(similarity(f_norm(name), f_norm($1)), word_similarity(f_norm($1), f_norm(name)))::numeric, 2) s
     FROM medicines WHERE f_norm(name) LIKE '%'||f_norm($1)||'%' OR f_norm(active_substance) LIKE '%'||f_norm($1)||'%'
        OR word_similarity(f_norm($1), f_norm(name)) > 0.3 ORDER BY s DESC LIMIT 2`, [q]);
  console.log(q, '->', r.rows.map((x) => `${x.name} (${x.s})`).join(' | '));
}
await c.end();
await h.stop();
