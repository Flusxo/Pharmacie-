// Lists elements wider than the viewport (horizontal overflow) on a page of the running dev server.
// usage: node scripts/overflow-probe.mjs <path without leading slash> <width> <email or none> [fr|en]
import { chromium } from '@playwright/test';
const [, , path = 'home', width = '360', who = 'alice@pharmacie.test', lang = 'fr'] = process.argv;
const base = 'http://localhost:5173';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(width), height: 780 } });
if (who !== 'none') {
  const r = await ctx.request.post(`${base}/api/auth/login`, { data: { email: who, password: 'Password123!' } });
  const { token } = await r.json();
  await ctx.addInitScript(([tk, lg]) => {
    localStorage.setItem('counter.token', tk);
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.lang', lg);
  }, [token, lang]);
}
const p = await ctx.newPage();
await p.goto(`${base}/${path.replace(/^\/+/, '')}`);
await p.waitForLoadState('networkidle');
await p.waitForTimeout(800);
const res = await p.evaluate(() => {
  const W = window.innerWidth;
  return [...document.querySelectorAll('body *')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.right > W + 0.5 && r.width > 0)
    .slice(0, 15)
    .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
});
console.log(res.join('\n'));
await b.close();
