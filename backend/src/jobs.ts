import { log } from './logger.js';
import { runExpiryJob } from './services/lifecycle.js';

/** Scheduled jobs: pharmacy response window (30 min) and request expiry (24 h). Runs every 60 s. */
export function startJobs(): void {
  const tick = () => {
    runExpiryJob()
      .then((r) => {
        if (r.windowsExpired || r.requestsExpired) log('info', 'expiry_job', r);
      })
      .catch((err: Error) => log('error', 'expiry_job_failed', { err: err.message }));
  };
  tick();
  setInterval(tick, 60_000).unref();
}
