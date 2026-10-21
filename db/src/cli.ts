import pg from 'pg';
import { databaseUrl } from './env.js';
import { ensurePostgres } from './postgres.js';
import { resetDatabase, counts } from './reset.js';
import { migrate } from './migrate.js';

const cmd = process.argv[2];

async function main(): Promise<void> {
  const url = databaseUrl();
  const handle = await ensurePostgres(url);
  try {
    if (cmd === 'reset') {
      await resetDatabase(url);
      console.log('[db] Reset complete:', await counts(url));
    } else if (cmd === 'migrate') {
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      const applied = await migrate(c);
      await c.end();
      console.log('[db] Applied migrations:', applied.length ? applied.join(', ') : 'none (up to date)');
    } else if (cmd === 'start') {
      console.log('[db] PostgreSQL is running. Press Ctrl+C to stop.');
      await new Promise<void>((resolve) => process.on('SIGINT', () => resolve()));
    } else {
      console.log('Usage: tsx src/cli.ts reset|migrate|start');
    }
  } finally {
    await handle.stop();
  }
}

main().catch((err: Error) => {
  console.error(`[db] ${err.message}`);
  process.exit(1);
});
