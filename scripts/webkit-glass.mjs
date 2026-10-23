// Frosted glass on WebKit (the engine of iPhone Safari): computed backdrop filters per panel on a 390 px iPhone, with the
// Low tier (where phones start) and Auto, plus screenshots next to a desktop Chromium one.
// usage: node scripts/webkit-glass.mjs   (dev server on :5173)
import { chromium, devices, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = 'http://localhost:5173';
const out = 'docs/screenshots/glass-mobile';
mkdirSync(out, { recursive: true });
const sel = ['.topbar', '.card', '.hero-panel', '.pub-footer', '.pub-menu', '.tabbar'];
const probe = (page) =>
  page.evaluate((sels) => {
    const r = { flat: document.documentElement.dataset.glass ?? null };
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cs = getComputedStyle(el);
      r[s] = (cs.webkitBackdropFilter || cs.backdropFilter || 'none').slice(0, 40);
    }
    return r;
  }, sel);

const wk = await webkit.launch();
for (const gfx of ['low', 'auto']) {
  for (const theme of ['light', 'dark']) {
    const ctx = await wk.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, colorScheme: theme });
    await ctx.addInitScript((g) => {
      localStorage.setItem('counter.graphics', g);
      localStorage.setItem('counter.tour', 'done');
    }, gfx);
    const page = await ctx.newPage();
    await page.goto(base + '/login', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    console.log('webkit-iphone', gfx, theme, JSON.stringify(await probe(page)));
    await page.screenshot({ path: `${out}/webkit-390-${gfx}-${theme}-login.png` });
    if (gfx === 'low') {
      await page.getByRole('button', { name: /menu/i }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      console.log('  menu open', JSON.stringify(await probe(page)));
      await page.screenshot({ path: `${out}/webkit-390-${gfx}-${theme}-menu.png` });
    }
    await ctx.close();
  }
}
await wk.close();

const ch = await chromium.launch();
const ctx = await ch.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('counter.tour', 'done'));
const page = await ctx.newPage();
await page.goto(base + '/login', { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log('chromium-desktop', JSON.stringify(await probe(page)));
await page.screenshot({ path: `${out}/chromium-1440-login.png` });
await ch.close();
