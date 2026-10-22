import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from '../db/src/env.js';

// Tests run against the local test database (bundled PostgreSQL on :5433 by default), never DATABASE_URL.
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      // Payments: no real key in tests (a fake Stripe client is injected); a fixed secret signs the test webhooks.
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_for_tests',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
