import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: path.join(ROOT, '.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (copy .env.example to .env)'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Stripe TEST keys (optional: without them the site answers "Payments not configured"). */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** The hosted site's address; several allowed, separated by commas (the first one is used in e-mail links). */
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid configuration in .env: ${msg}`);
}

export const config = parsed.data;
/** Addresses allowed by CORS, without trailing slash. */
export const FRONTEND_ORIGINS = config.FRONTEND_URL.split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
export const PRIMARY_FRONTEND = FRONTEND_ORIGINS[0] ?? 'http://localhost:5173';
export const isTest = config.NODE_ENV === 'test';
export const isProd = config.NODE_ENV === 'production';

if (isProd && config.JWT_SECRET.startsWith('dev-only')) {
  throw new Error('Refusing to start in production with the example JWT_SECRET. Set a long random secret in .env.');
}

/** Business constants (one place). */
export const RULES = {
  PHARMACY_RESPONSE_MINUTES: 30,
  REQUEST_EXPIRY_HOURS: 24,
  IDEMPOTENCY_WINDOW_MINUTES: 2,
  LOCKOUT_FAILURES: 5,
  LOCKOUT_MINUTES: 15,
  RESET_TOKEN_MINUTES: 30,
  SHARE_LINK_HOURS_AFTER_DELIVERY: 2,
  PAGE_SIZE: 20,
  MIN_PASSWORD: 10,
} as const;
