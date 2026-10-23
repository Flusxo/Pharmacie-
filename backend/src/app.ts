import crypto from 'node:crypto';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { FRONTEND_ORIGINS, isProd } from './config.js';
import { fakeCheckout, fakeEnabled, handleWebhook } from './services/payments.js';
import { pool } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { log } from './logger.js';
import { langOf, tr } from './i18n/index.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { patientRouter } from './routes/patient.js';
import { doctorRouter } from './routes/doctor.js';
import { pharmacyRouter } from './routes/pharmacy.js';
import { commonRouter } from './routes/common.js';
import { contactRouter } from './routes/contact.js';
import { adminRouter } from './routes/admin.js';
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

  // Answers in the request language: "error" and "message" texts are translated (catalogue in i18n/messages.ts).
  app.use((req, res, next) => {
    const lang = langOf(req);
    res.locals.lang = lang;
    res.setHeader('Content-Language', lang);
    if (lang !== 'en') {
      const json = res.json.bind(res);
      res.json = (body: unknown) => {
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const b = body as Record<string, unknown>;
          if (typeof b.error === 'string') b.error = tr(b.error, lang);
          if (typeof b.message === 'string') b.message = tr(b.message, lang);
        }
        return json(body);
      };
    }
    next();
  });

  app.use(
    helmet({
      // The site is hosted on another address and calls this API from the browser.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          // Swagger UI at /api/docs needs inline styles.
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin: FRONTEND_ORIGINS, credentials: false }));
  // Stripe webhook: the signature covers the exact bytes, so this route reads the raw body (before express.json).
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const result = await handleWebhook(req.body as Buffer, req.header('stripe-signature'));
    if (result === 'bad_signature') {
      res.status(400).json({ error: 'Invalid webhook signature.', code: 'bad_signature' });
      return;
    }
    res.json({ received: true, duplicate: result === 'duplicate' });
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable', time: new Date().toISOString() });
    }
  });
  // API documentation: development and tests only, never in production.
  if (!isProd) {
    const openapi = openapiSpec();
    app.get('/api/openapi.json', (_req, res) => {
      res.json(openapi);
    });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'PharmaLink API' }));
  }

  app.use('/api', authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api', contactRouter);
  app.use('/api', commonRouter);
  if (fakeEnabled()) {
    // Simulated Stripe checkout (development and e2e only; the server refuses to start with it in production).
    app.post('/api/dev/fake-stripe/:sessionId/complete', requireRole('patient'), async (req, res) => {
      const { sessionId } = z.object({ sessionId: z.string().min(5).max(80) }).parse(req.params);
      const { card } = z.object({ card: z.string().min(1).max(30) }).parse(req.body);
      res.json(await fakeCheckout(sessionId, req.user!.id, card));
    });
  }
  app.use('/api/patient', patientRouter);
  app.use('/api/doctor', doctorRouter);
  app.use('/api/pharmacy', pharmacyRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
