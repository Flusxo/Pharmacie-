import { log } from './logger.js';
import { pool } from './db.js';
import { runExpiryJob } from './services/lifecycle.js';
import { runStockWatchJob } from './services/watches.js';
import { runFileCleanupJob } from './services/files.js';
import { runRefillJob } from './services/refills.js';
import { runWeeklySummaryJob } from './services/weekly.js';

/** Scheduled jobs: pharmacy response window (30 min) and request expiry (24 h). Runs every 60 s. */
export function startJobs(): void {
  const tick = () => {
    runExpiryJob()
      .then((r) => {
        if (r.windowsExpired || r.requestsExpired) log('info', 'expiry_job', r);
      })
      .catch((err: Error) => log('error', 'expiry_job_failed', { err: err.message }));
  };
  // A pharmacy on a break comes back by itself when the break ends.
  const breaks = () =>
    pool
      .query('UPDATE pharmacies SET paused = false, paused_until = NULL WHERE paused_until IS NOT NULL AND paused_until <= now()')
      .then((r) => r.rowCount && log('info', 'breaks_ended', { n: r.rowCount }))
      .catch((err: Error) => log('error', 'breaks_job_failed', { err: err.message }));
  const watches = () =>
    runStockWatchJob()
      .then((r) => r.notified && log('info', 'stock_alerts_sent', r))
      .catch((err: Error) => log('error', 'stock_watch_job_failed', { err: err.message }));
  const cleanup = () =>
    runFileCleanupJob()
      .then((r) => r.deleted && log('info', 'files_deleted', r))
      .catch((err: Error) => log('error', 'file_cleanup_failed', { err: err.message }));
  const refills = () =>
    runRefillJob()
      .then((r) => r.sent && log('info', 'refill_reminders_sent', r))
      .catch((err: Error) => log('error', 'refill_job_failed', { err: err.message }));
  void refills();
  setInterval(() => void refills(), 15 * 60_000).unref();
  const weekly = () =>
    runWeeklySummaryJob()
      .then((r) => r.sent && log('info', 'weekly_summary_sent', r))
      .catch((err: Error) => log('error', 'weekly_summary_failed', { err: err.message }));
  void weekly();
  setInterval(() => void weekly(), 30 * 60_000).unref();
  void cleanup();
  setInterval(() => void cleanup(), 10 * 60_000).unref();
  tick();
  void breaks();
  void watches();
  setInterval(() => void watches(), 60_000).unref();
  setInterval(tick, 60_000).unref();
  setInterval(() => void breaks(), 30_000).unref();
}
