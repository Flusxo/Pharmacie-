/**
 * `npm run e2e`: end-to-end tests against the real API and frontend, on their own local database.
 * 1. Bundled PostgreSQL (:5433) + fresh database pharmalink_e2e (never DATABASE_URL / Neon).
 * 2. API on :4100, frontend on :5174 (no tile key) and :5175 (test tile URL answered by Playwright routes).
 * 3. Runs Playwright, then stops every server and PostgreSQL cleanly (this runner owns their lifecycle,
 *    so an interrupted test run never leaves a half-stopped PostgreSQL behind).
 * Extra arguments are passed to Playwright, e.g. `npm run e2e -- e2e/map.spec.ts`.
 */
import { spawn, execSync, execFileSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://pharmalink:pharmalink@localhost:5433/pharmalink_e2e';
const API_PORT = 4100;
const WEB_PORT = 5174;
const WEB_TILES_PORT = 5175;
const E2E_TILE_URL = 'https://tiles.e2e.test/{z}/{x}/{y}.png';

/** Local test PostgreSQL in its own process (db/scripts/test-pg.ts): no hooks here, clean "fast" stop. */
const testPg = (...args: string[]) =>
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'db', 'scripts', 'test-pg.ts'), ...args],
    {
      encoding: 'utf8',
    },
  ).trim();

const children: ChildProcess[] = [];
function start(cmd: string, cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const c = spawn(cmd, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'], shell: true });
  children.push(c);
  return c;
}
function killTree(c: ChildProcess): void {
  if (!c.pid) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${c.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-c.pid, 'SIGTERM');
  } catch {
    // already stopped
  }
}
async function waitForHttp(url: string, ms = 90_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port);
  });
}

let code = 1;
let pgStarted = false;
try {
  for (const p of [API_PORT, WEB_PORT, WEB_TILES_PORT]) {
    if (!(await portFree(p))) throw new Error(`Port ${p} is busy. Stop the process using it (e.g. an earlier e2e run) and retry.`);
  }
  pgStarted = testPg('up', E2E_DB).endsWith('started');
  console.log('[e2e] database pharmalink_e2e reset');
  start('npx tsx backend/src/server.ts', ROOT, {
    DATABASE_URL: E2E_DB,
    PORT: String(API_PORT),
    FRONTEND_URL: `http://localhost:${WEB_PORT}`,
  });
  const vite = (port: number, tileUrl: string) =>
    start('npx vite --config vite.config.ts', path.join(ROOT, 'frontend'), {
      FRONTEND_PORT: String(port),
      API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      VITE_MAP_TILE_URL: tileUrl,
    });
  vite(WEB_PORT, '');
  vite(WEB_TILES_PORT, E2E_TILE_URL);
  await waitForHttp(`http://localhost:${API_PORT}/api/health`);
  await waitForHttp(`http://localhost:${WEB_PORT}/api/health`);
  await waitForHttp(`http://localhost:${WEB_TILES_PORT}/api/health`);
  console.log('[e2e] servers ready: API :4100, web :5174 (no tiles), web :5175 (test tiles)');

  const pw = spawn(`npx playwright test ${process.argv.slice(2).join(' ')}`, { cwd: ROOT, stdio: 'inherit', shell: true });
  code = await new Promise<number>((resolve) => pw.on('exit', (c) => resolve(c ?? 1)));
} catch (err) {
  console.error(`[e2e] ${(err as Error).message}`);
} finally {
  for (const c of children) killTree(c);
  if (pgStarted) testPg('down');
}
process.exit(code);
