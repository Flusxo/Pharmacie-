/**
 * Servers for Playwright: a fresh local database (pharmalink_e2e on the bundled PostgreSQL :5433),
 * the API on :4100 and the frontend on :5174. Never touches DATABASE_URL (Neon) or the dev servers.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePostgres, resetDatabase } from '../db/src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://pharmalink:pharmalink@localhost:5433/pharmalink_e2e';
const API_PORT = '4100';
const WEB_PORT = '5174';

const handle = await ensurePostgres(E2E_DB);
await resetDatabase(E2E_DB);
console.log('[e2e] database pharmalink_e2e reset');

const env = { ...process.env, DATABASE_URL: E2E_DB, PORT: API_PORT, FRONTEND_URL: `http://localhost:${WEB_PORT}` };
const api = spawn('npx tsx backend/src/server.ts', { cwd: ROOT, env, stdio: 'inherit', shell: true });
const web = spawn('npx vite --config vite.config.ts', {
  cwd: path.join(ROOT, 'frontend'),
  env: { ...process.env, FRONTEND_PORT: WEB_PORT, API_PROXY_TARGET: `http://localhost:${API_PORT}` },
  stdio: 'inherit',
  shell: true,
});

const stop = async () => {
  api.kill();
  web.kill();
  await handle.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
