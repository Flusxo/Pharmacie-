import pg from 'pg';
import { config } from './config.js';
import { pgConfig } from './pgconfig.js';

// numeric -> JS number (prices are small, 2 decimals)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// int8 (count(*)) -> number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({ ...pgConfig(config.DATABASE_URL), max: 10 });

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T[]> {
  const r = await db.query<T>(text, params);
  return r.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T | undefined> {
  const r = await db.query<T>(text, params);
  return r.rows[0];
}

/** Runs fn inside a transaction; rolls back on any error. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
