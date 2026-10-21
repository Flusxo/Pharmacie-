/**
 * Makes sure a PostgreSQL server answers at DATABASE_URL.
 * - Route C (EMBEDDED_PG=true, default): starts the PostgreSQL 16 bundled through npm (embedded-postgres).
 * - Routes A/B (Docker or a local install): waits up to 30 s, then explains what to do.
 */
import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { ROOT, databaseUrl, embeddedEnabled } from './env.js';

export interface PgHandle {
  started: boolean;
  stop: () => Promise<void>;
}

const DATA_DIR = path.join(ROOT, 'db', '.pgdata');

async function canConnect(url: string): Promise<'ok' | 'no-db' | 'down'> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.end();
    return 'ok';
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 3D000 = database does not exist; 28P01/28000 = auth problem (server is up).
    if (code === '3D000') return 'no-db';
    if (code === '28P01' || code === '28000') {
      throw new Error(`PostgreSQL rejected the credentials in DATABASE_URL (${code}). Check user/password in .env.`);
    }
    return 'down';
  }
}

export async function createDatabaseIfMissing(url: string): Promise<void> {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.slice(1));
  u.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
      await admin.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}

export async function ensurePostgres(url = databaseUrl()): Promise<PgHandle> {
  const state = await canConnect(url);
  if (state === 'ok') return { started: false, stop: async () => {} };
  if (state === 'no-db') {
    await createDatabaseIfMissing(url);
    return { started: false, stop: async () => {} };
  }

  if (embeddedEnabled()) {
    const u = new URL(url);
    const ep = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      port: Number(u.port || 5432),
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });
    if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      console.log('[db] First run: initialising the bundled PostgreSQL 16 in db/.pgdata ...');
      await ep.initialise();
    }
    try {
      await ep.start();
    } catch (err) {
      throw new Error(
        `Could not start the bundled PostgreSQL on port ${u.port}. Is another program using that port? ` +
          `(Windows: netstat -ano | findstr :${u.port}; macOS/Linux: lsof -i :${u.port}). Details: ${(err as Error).message}`,
      );
    }
    await createDatabaseIfMissing(url);
    console.log(`[db] Bundled PostgreSQL 16 running on port ${u.port}.`);
    return { started: true, stop: () => ep.stop() };
  }

  // Docker / local PostgreSQL: wait up to 30 seconds.
  const deadline = Date.now() + 30_000;
  process.stdout.write('[db] Waiting for PostgreSQL');
  while (Date.now() < deadline) {
    const s = await canConnect(url);
    if (s !== 'down') {
      process.stdout.write(' ready.\n');
      if (s === 'no-db') await createDatabaseIfMissing(url);
      return { started: false, stop: async () => {} };
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\n');
  throw new Error(
    'Cannot connect to PostgreSQL at DATABASE_URL after 30 seconds.\n' +
      '  - Docker: run `docker compose up -d` and wait for "healthy".\n' +
      '  - Local PostgreSQL: start the service and create the role/database (see README).\n' +
      '  - Or set EMBEDDED_PG=true in .env to use the bundled PostgreSQL.',
  );
}
