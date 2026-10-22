import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from '../../db/src/env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (...args: string[]) =>
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'db', 'scripts', 'test-pg.ts'), ...args],
    {
      encoding: 'utf8',
    },
  ).trim();

let started = false;

/** Starts (or reuses) the local test PostgreSQL in a separate process and resets the test database. */
export function setup(): void {
  started = run('up', testDatabaseUrl()).endsWith('started');
}

export function teardown(): void {
  if (started) run('down');
}
