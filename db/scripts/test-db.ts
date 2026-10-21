/** Prepares the test database (TEST_DATABASE_URL, or the bundled PostgreSQL on localhost:5433). Never touches DATABASE_URL. */
import { counts, ensurePostgres, resetDatabase, testDatabaseUrl } from '../src/index.js';

const url = testDatabaseUrl();
const h = await ensurePostgres(url);
await resetDatabase(url);
console.log('[db] Test database ready:', await counts(url));
await h.stop();
