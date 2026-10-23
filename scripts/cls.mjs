// Which elements shift the layout? usage: node scripts/cls.mjs   (medicine page of the production build)
import { chromium } from '@playwright/test';
const base = process.env.BASE ?? 'http://localhost:4173';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const r = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'alice@pharmacie.test', password: 'Password123!' }),
});
const token = (await r.json()).token;
await ctx.addInitScript((tk) => {
  localStorage.setItem('counter.token', tk);
  localStorage.setItem('counter.tour', 'done');
  window.__shifts = [];
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      if (e.hadRecentInput) return;
      window.__shifts.push({
        at: Math.round(e.startTime),
        value: Math.round(e.value * 1000) / 1000,
        nodes: e.sources.map(
          (s) =>
            `${s.node?.nodeName}.${(s.node?.className || '').toString().slice(0, 40)} ${JSON.stringify(s.previousRect)} -> ${JSON.stringify(s.currentRect)}`,
        ),
      });
    }),
  ).observe({ type: 'layout-shift', buffered: true });
}, token);
const page = await ctx.newPage();
await page.goto(base + '/search?q=Doliprane');
await page.getByTestId('medicine-card').first().click();
await page.waitForTimeout(9000);
console.log(JSON.stringify(await page.evaluate(() => window.__shifts), null, 1));
await browser.close();
