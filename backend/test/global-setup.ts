import { ensurePostgres, resetDatabase, testDatabaseUrl, isLocalUrl } from '../../db/src/index.js';

let stop: (() => Promise<void>) | undefined;

export async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  if (!isLocalUrl(url) && process.env.ALLOW_REMOTE_TEST_DB !== 'true') {
    throw new Error('Refusing to run tests against a non-local database. Tests wipe their database.');
  }
  const handle = await ensurePostgres(url);
  stop = handle.stop;
  await resetDatabase(url);
}

export async function teardown(): Promise<void> {
  await stop?.();
}
