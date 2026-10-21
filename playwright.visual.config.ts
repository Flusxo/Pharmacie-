import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Screenshots of the 3D scenes with software WebGL (SwiftShader). Run: npm run e2e -- --config playwright.visual.config.ts
export default defineConfig({
  ...base,
  testMatch: '**/*.visual.ts',
  timeout: 600_000,
  expect: { timeout: 60_000 },
  projects: [
    {
      name: 'chromium-swiftshader',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
});
