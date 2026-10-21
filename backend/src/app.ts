import crypto from 'node:crypto';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { log } from './logger.js';
import { authenticate } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { openapiSpec } from './openapi.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    const requestId = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      // Path only (no query string: it may contain a searched medicine name).
      log('info', 'request', {
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
        role: req.user?.role,
      });
    });
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Swagger UI at /api/docs needs inline styles.
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin: [config.FRONTEND_URL], credentials: false }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable', time: new Date().toISOString() });
    }
  });
  const openapi = openapiSpec();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openapi);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'PharmaLink API' }));

  app.use('/api', authenticate);
  app.use('/api/auth', authRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
