/**
 * `npm run dev`: API (:4000) + frontend (:5173) together.
 * - If a port is busy, says which process holds it and stops (never moves to another port).
 * - If DATABASE_URL points at localhost and EMBEDDED_PG=true, also starts the bundled PostgreSQL.
 */
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    console.error('\n[dev] No .env file. Run:  cp .env.example .env   (then put your DATABASE_URL in it)\n');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

function whoHolds(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
      const line = out.split(/\r?\n/).find((l) => new RegExp(`[:.]${port}\\s.*LISTENING`).test(l));
      const pid = line?.trim().split(/\s+/).pop();
      if (!pid) return null;
      const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }).split(',')[0]?.replace(/"/g, '');
      return { pid, name: task || 'unknown', kill: `taskkill /PID ${pid} /F` };
    }
    const pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim().split('\n')[0];
    if (!pid) return null;
    const name = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim();
    return { pid, name, kill: `kill ${pid}` };
  } catch {
    return null;
  }
}

const env = readEnv();
const API_PORT = Number(env.PORT || 4000);
const WEB_PORT = 5173;

for (const [port, what] of [
  [API_PORT, 'API'],
  [WEB_PORT, 'frontend'],
]) {
  if (!(await portFree(port))) {
    const p = whoHolds(port);
    console.error(
      `\n[dev] Port ${port} (${what}) is already in use${p ? ` by ${p.name} (PID ${p.pid})` : ''}.\n` +
        `      Stop that process first${p ? `:  ${p.kill}` : ''}\n` +
        `      (Often an earlier \`npm run dev\` that is still running in another terminal.)\n`,
    );
    process.exit(1);
  }
}

const children = [];
function run(name, color, args) {
  const child = spawn(`npm ${args.join(' ')}`, { cwd: ROOT, shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) out.write(prefix + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix}stopped (exit ${code}). Stopping everything.`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      if (isWin) execSync(`taskkill /PID ${c.pid} /T /F`, { stdio: 'ignore' });
      else c.kill('SIGINT');
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Local DATABASE_URL + EMBEDDED_PG: start the bundled PostgreSQL and wait for it.
const dbUrl = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
const local = dbUrl && ['localhost', '127.0.0.1', '::1'].includes(dbUrl.hostname);
if (local && (env.EMBEDDED_PG ?? 'true') === 'true') {
  run('db', '35', ['run', 'start', '-w', 'db']);
  const port = Number(dbUrl.port || 5432);
  const deadline = Date.now() + 60_000;
  while ((await portFree(port)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
}

run('api', '36', ['run', 'dev', '-w', 'backend']);
run('web', '32', ['run', 'dev', '-w', 'frontend']);
console.log(`\n[dev] Starting… open http://localhost:${WEB_PORT}  (API docs: http://localhost:${API_PORT}/api/docs)\n`);
