// What does a visitor see while the home page loads? A screenshot every 1.5 s for the first 12 s.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173';
const out = 'docs/screenshots/early';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  localStorage.setItem('counter.tour', 'done');
  localStorage.setItem('counter.theme', 'dark');
});
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(base + '/', { waitUntil: 'commit' });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/home-t${String(Date.now() - t0).padStart(5, '0')}.png` });
}
await browser.close();
