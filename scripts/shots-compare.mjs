// Before / after screenshots of key pages on the running dev server (npm run dev), GPU through ANGLE.
// usage: node scripts/shots-compare.mjs <tag> [dark|light] [pageFilter]   -> docs/screenshots/design/<tag>/
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [, , tag = 'after', scheme = 'dark', only = ''] = process.argv;
const base = 'http://localhost:5173';
const out = `docs/screenshots/design/${tag}`;
mkdirSync(out, { recursive: true });
const gl = process.env.RENDER_GL ?? (process.platform === 'win32' ? 'd3d11' : 'gl');
const pages = [
  [null, 'home', '/'],
  [null, 'login', '/login'],
  [null, 'register', '/register'],
  [null, 'how', '/how-it-works'],
  [null, 'patients', '/patients'],
  ['alice@pharmacie.test', 'search', '/search?q=doli'],
  ['alice@pharmacie.test', 'medicine', '/search?q=Doliprane', 'medicine-card'],
  ['pharmacie.tournon@pharmacie.test', 'dashboard', '/pharmacy'],
];
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const tokens = {};
for (const width of [1440, 390]) {
  for (const [who, name, path, click] of pages.filter(([, n]) => !only || n.includes(only))) {
    if (who && !tokens[who]) {
      const r = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: who, password: 'Password123!' }),
      });
      tokens[who] = (await r.json()).token;
    }
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 800 : 900 }, colorScheme: scheme, locale: 'fr-FR' });
    await ctx.addInitScript(
      ([tk, th]) => {
        if (tk) localStorage.setItem('counter.token', tk);
        localStorage.setItem('counter.theme', th);
        localStorage.setItem('counter.graphics', 'medium');
        localStorage.setItem('counter.tour', 'done');
      },
      [who ? tokens[who] : null, scheme],
    );
    const page = await ctx.newPage();
    await page.goto(base + path);
    await page.waitForSelector('.page-bg.ready', { timeout: 90_000 }).catch(() => {});
    if (click) await page.getByTestId(click).first().click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${out}/${name}-${width}-${scheme}.png` });
    console.log(`${tag} ${name} ${width} ${scheme}`);
    await ctx.close();
  }
}
await browser.close();
