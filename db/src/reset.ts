import pg from 'pg';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

/** Drop everything, migrate, seed. Used by `npm run db:reset` and by the backend tests. */
export async function resetDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SET client_min_messages TO WARNING');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await migrate(client);
    await client.query('BEGIN');
    await seed(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

export async function counts(url: string): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(`SELECT
      (SELECT count(*) FROM medicines)::int AS medicines,
      (SELECT count(*) FROM pharmacies)::int AS pharmacies,
      (SELECT count(*) FROM doctors)::int AS doctors,
      (SELECT count(*) FROM patients)::int AS patients,
      (SELECT count(*) FROM staff)::int AS staff,
      (SELECT count(*) FROM orders)::int AS orders`);
    return r.rows[0] as Record<string, number>;
  } finally {
    await client.end();
  }
}
