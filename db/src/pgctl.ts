/**
 * Detached start/stop of the bundled PostgreSQL with its own pg_ctl.
 * Used by test runners: unlike the embedded-postgres package, this registers no exit hooks in the
 * calling process and always shuts down cleanly ("fast" mode), so no orphan keeps the port open.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './env.js';

const DATA_DIR = path.join(ROOT, 'db', '.pgdata');

function binDir(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  const pkg = `@embedded-postgres/${os}-${process.arch}`;
  // Entry is <pkg>/dist/index.js; binaries are in <pkg>/native/bin.
  const entry = fileURLToPath(import.meta.resolve(pkg));
  return path.join(path.dirname(path.dirname(entry)), 'native', 'bin');
}
const exe = (name: string) => path.join(binDir(), process.platform === 'win32' ? `${name}.exe` : name);

/** True when the bundled cluster exists (created on first use by ensurePostgres). */
export const clusterExists = () => fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));

export function pgCtlStart(port: number): void {
  const log = path.join(DATA_DIR, 'pg_ctl.log');
  execFileSync(exe('pg_ctl'), ['start', '-D', DATA_DIR, '-o', `-p ${port}`, '-l', log, '-w', '-t', '60'], { stdio: 'ignore' });
}

export function pgCtlStop(): void {
  try {
    execFileSync(exe('pg_ctl'), ['stop', '-D', DATA_DIR, '-m', 'fast', '-w', '-t', '30'], { stdio: 'ignore' });
  } catch {
    // not running
  }
}
