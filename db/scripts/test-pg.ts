/**
 * Test database helper, run in its own process by test runners (so no PostgreSQL hooks live in them).
 *   tsx db/scripts/test-pg.ts up <url>     start the bundled PostgreSQL if needed, reset <url>, print "started" or "reused"
 *   tsx db/scripts/test-pg.ts down         stop the bundled PostgreSQL (fast, clean)
 * Only local URLs are accepted: tests wipe their database.
 */
import { clusterExists, pgCtlStart, pgCtlStop } from '../src/pgctl.js';
import { ensurePostgres, isLocalUrl, resetDatabase } from '../src/index.js';
import pg from 'pg';

const [cmd, url] = process.argv.slice(2);

async function answers(u: string): Promise<boolean> {
  const c = new pg.Client({ connectionString: u, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch (e) {
    return (e as { code?: string }).code === '3D000'; // server up, database missing
  }
}

if (cmd === 'down') {
  pgCtlStop();
  process.exit(0);
}
if (cmd !== 'up' || !url) {
  console.error('Usage: tsx db/scripts/test-pg.ts up <local-url> | down');
  process.exit(2);
}
if (!isLocalUrl(url)) {
  console.error('Refusing: tests only run against a local database.');
  process.exit(2);
}

const admin = new URL(url);
admin.pathname = '/postgres';
let state = 'reused';
if (!(await answers(admin.toString()))) {
  if (!clusterExists()) {
    // First run ever: let embedded-postgres create the cluster, then hand over to pg_ctl.
    const h = await ensurePostgres(url);
    await h.stop();
  }
  pgCtlStart(Number(new URL(url).port || 5432));
  state = 'started';
}
await ensurePostgres(url); // creates the database if missing (server already up: no embedded start)
await resetDatabase(url);
console.log(state);
process.exit(0);
