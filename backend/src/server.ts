import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { startJobs } from './jobs.js';
import { log } from './logger.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  log('info', 'api_listening', { port: config.PORT, docs: `http://localhost:${config.PORT}/api/docs` });
  startJobs();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[api] Port ${config.PORT} is already in use. Stop the other process first:\n` +
        `  Windows:      netstat -ano | findstr :${config.PORT}   then   taskkill /PID <pid> /F\n` +
        `  macOS/Linux:  lsof -i :${config.PORT}   then   kill <pid>\n`,
    );
    process.exit(1);
  }
  throw err;
});

const shutdown = () => {
  server.close(() => void pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
