import { log } from './logger.js';
import { pool } from './db.js';
import { runExpiryJob } from './services/lifecycle.js';
import { runStockWatchJob } from './services/watches.js';

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
  tick();
  void breaks();
  void watches();
  setInterval(() => void watches(), 60_000).unref();
  setInterval(tick, 60_000).unref();
  setInterval(() => void breaks(), 30_000).unref();
}
