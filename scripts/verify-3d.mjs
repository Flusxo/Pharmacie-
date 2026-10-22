// Verification pass for the persistent 3D stage, on a running dev server (npm run dev), headless Chromium with the
// machine's GPU (ANGLE). For each page: reached by client-side navigation (no reload) and again after a refresh;
// checks that the same root canvas element stays in place, then saves a screenshot to docs/screenshots/verify/.
// usage: node scripts/verify-3d.mjs [width] [high|medium]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const [, , width = '1440', tier = 'medium'] = process.argv;
const W = Number(width);
const base = 'http://localhost:5173';
const out = 'docs/screenshots/verify';
mkdirSync(out, { recursive: true });
const gl = process.env.RENDER_GL ?? (process.platform === 'win32' ? 'd3d11' : 'gl');
const pages = [
  ['alice@pharmacie.test', 'home', '/home'],
  ['alice@pharmacie.test', 'search', '/search?q=doli'],
  ['alice@pharmacie.test', 'details', '/search?q=Hélicidine', 'medicine-card'],
  ['alice@pharmacie.test', 'map', '/map'],
  ['alice@pharmacie.test', 'requests', '/requests'],
  ['pharmacie.tournon@pharmacie.test', 'pharmacy', '/pharmacy'],
  ['admin@pharmacie.test', 'admin', '/admin'],
  [null, 'public-home', '/'],
  [null, 'public-how', '/how-it-works'],
  [null, 'login', '/login'],
];
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = [];
const marker = () => {
  window.__c = document.querySelector('[data-testid="root-stage"] canvas');
};
const state = () => ({
  same: window.__c !== null && window.__c === document.querySelector('[data-testid="root-stage"] canvas'),
  scene: document.querySelector('[data-testid="root-stage"]')?.getAttribute('data-scene'),
  mode: document.querySelector('[data-testid="root-stage"]')?.getAttribute('data-mode'),
  canvases: document.querySelectorAll('canvas').length,
});
const tokens = {};
for (const [who, name, path, click] of pages) {
  if (who && !tokens[who]) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: who, password: 'Password123!' }),
    });
    tokens[who] = (await r.json()).token;
  }
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 800 : 900 } });
  await ctx.addInitScript(
    ([tk, t]) => {
      if (tk) localStorage.setItem('counter.token', tk);
      localStorage.setItem('counter.graphics', t);
      localStorage.setItem('counter.tour', 'done');
    },
    [who ? tokens[who] : null, tier],
  );
  const page = await ctx.newPage();
  // 1) land on a first page, mark the canvas, then reach the target by client-side navigation (no reload).
  await page.goto(base + (who ? '/home' : '/pharmacies'));
  await page.waitForSelector('.page-bg.ready', { timeout: 90_000 });
  await page.evaluate(marker);
  const target = click ? path.split('?')[0] : path;
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  if (click) await page.getByTestId(click).first().click();
  await page.waitForTimeout(5000);
  const nav = await page.evaluate(state);
  await page.screenshot({ path: `${out}/${name}-${W}-navigated.png` });
  // 2) refresh: a new page, the stage must come back.
  await page.reload();
  await page.waitForSelector('.page-bg.ready', { timeout: 90_000 });
  await page.waitForTimeout(5000);
  const ref = await page.evaluate(state);
  await page.screenshot({ path: `${out}/${name}-${W}-refreshed.png` });
  // The picture must not be empty: compare the colour spread of the screenshot.
  const stats = await sharp(`${out}/${name}-${W}-refreshed.png`).stats();
  const spread = Math.round(stats.channels.slice(0, 3).reduce((s, c) => s + c.stdev, 0) / 3);
  const row = { page: name, width: W, tier, navigated: nav, refreshed: ref, colourSpread: spread };
  report.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
  void target;
}
writeFileSync(`${out}/report-${W}-${tier}.json`, JSON.stringify(report, null, 2));
await browser.close();
