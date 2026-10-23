// Screenshots of the live scroll stories: for each page, scroll to every step and capture the viewport.
// usage: node scripts/story-shots.mjs <tag> [dark|light] [pageFilter]   -> docs/screenshots/stories/<tag>/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [, , tag = 'run', scheme = 'dark', only = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173';
const out = `docs/screenshots/stories/${tag}`;
mkdirSync(out, { recursive: true });
const gl = process.platform === 'win32' ? 'd3d11' : 'gl';
const pages = [
  ['home', '/'],
  ['patients', '/patients'],
  ['pharmacies', '/pharmacies'],
  ['doctors', '/doctors'],
];
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const width of [1440, 390]) {
  for (const [name, path] of pages.filter(([n]) => !only || n === only)) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 800 : 900 }, colorScheme: scheme, locale: 'fr-FR' });
    await ctx.addInitScript((th) => {
      localStorage.setItem('counter.theme', th);
      localStorage.setItem('counter.graphics', 'medium');
      localStorage.setItem('counter.tour', 'done');
    }, scheme);
    const page = await ctx.newPage();
    await page.goto(base + path);
    await page.waitForSelector('.page-bg.ready', { timeout: 90_000 }).catch(() => {});
    const steps = page.getByTestId('story-live-step');
    const n = await steps.count();
    for (let i = 0; i < n; i++) {
      await steps.nth(i).scrollIntoViewIfNeeded();
      await steps.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(2200);
      await page.screenshot({ path: `${out}/${name}-${width}-${scheme}-step${i + 1}.png` });
    }
    console.log(`${name} ${width}: ${n} steps`);
    await ctx.close();
  }
}
await browser.close();
