import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the real API and frontend. Run them with `npm run e2e` (scripts/e2e.ts starts
// the database and servers, runs Playwright, then stops everything cleanly).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: '**/three.spec.ts' },
    // The 3D tests get their own browser process, so the software GPU state of the other tests cannot affect them.
    { name: 'three', use: { ...devices['Desktop Chrome'] }, testMatch: '**/three.spec.ts' },
  ],
});
