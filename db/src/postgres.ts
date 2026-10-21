/**
 * Makes sure a PostgreSQL server answers at a URL.
 * - Hosted (Neon, default for the app): connects with TLS when sslmode=require; waits up to 30 s.
 * - Local URL + EMBEDDED_PG=true: starts the PostgreSQL 16 bundled through npm (embedded-postgres).
 *   Used by default for the test database; optional for development.
 * - Other local servers (Docker / local install): waits up to 30 s, then explains what to do.
 */
import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { ROOT, databaseUrl, embeddedEnabled } from './env.js';
import { isLocalUrl, pgConfig, safeHost } from './pgconfig.js';

export interface PgHandle {
  started: boolean;
  stop: () => Promise<void>;
}

const DATA_DIR = path.join(ROOT, 'db', '.pgdata');
const noop: PgHandle = { started: false, stop: async () => {} };

async function canConnect(url: string): Promise<'ok' | 'no-db' | 'down'> {
  const client = new pg.Client({ ...pgConfig(url), connectionTimeoutMillis: isLocalUrl(url) ? 1500 : 10_000 });
  try {
    await client.connect();
    await client.end();
    return 'ok';
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 3D000 = database does not exist; 28P01/28000 = auth problem (server is up).
    if (code === '3D000') return 'no-db';
    if (code === '28P01' || code === '28000') {
      throw new Error(`PostgreSQL at ${safeHost(url)} rejected the credentials (${code}). Check DATABASE_URL in .env.`);
    }
    return 'down';
  }
}

/** Creates the database on a LOCAL server if it is missing. Hosted databases are never created here. */
export async function createDatabaseIfMissing(url: string): Promise<void> {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.slice(1));
  if (!isLocalUrl(url)) {
    throw new Error(`Database "${dbName}" does not exist on ${safeHost(url)}. Create it in your provider's console (e.g. Neon) first.`);
  }
  u.pathname = '/postgres';
  const admin = new pg.Client(pgConfig(u.toString()));
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

async function startEmbedded(url: string): Promise<PgHandle> {
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

export async function ensurePostgres(url = databaseUrl()): Promise<PgHandle> {
  const state = await canConnect(url);
  if (state === 'ok') return noop;
  if (state === 'no-db') {
    await createDatabaseIfMissing(url);
    return noop;
  }

  if (isLocalUrl(url) && embeddedEnabled()) return startEmbedded(url);

  const deadline = Date.now() + 30_000;
  process.stdout.write(`[db] Waiting for PostgreSQL at ${safeHost(url)}`);
  while (Date.now() < deadline) {
    const s = await canConnect(url);
    if (s !== 'down') {
      process.stdout.write(' ready.\n');
      if (s === 'no-db') await createDatabaseIfMissing(url);
      return noop;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\n');
  throw new Error(
    isLocalUrl(url)
      ? 'Cannot connect to the local PostgreSQL after 30 seconds.\n' +
          '  - Docker: run `docker compose up -d` and wait for "healthy".\n' +
          '  - Local PostgreSQL: start the service (see README).\n' +
          '  - Or set EMBEDDED_PG=true in .env to use the bundled PostgreSQL.'
      : `Cannot connect to ${safeHost(url)} after 30 seconds. Check your internet connection, that the Neon project is not suspended or deleted, ` +
          'and that DATABASE_URL in .env is the full connection string (with ?sslmode=require).',
  );
}
