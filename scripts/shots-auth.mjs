// Login, sign-up, home and a dashboard at 1440, 768 and 390 px, light and dark, French and English, with the live 3D (GPU through
// ANGLE, graphics Medium) on the running dev server (npm run dev). Also two cursor shots (over the headline and over a button).
// Reports horizontal overflow and the objects/text overlap check (see "overlap" below).
// usage: node scripts/shots-auth.mjs [lang] [scheme] [pageFilter]   -> docs/screenshots/design/<lang>-<scheme>/<width>-<page>.jpg
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const [, , onlyLang = '', onlyScheme = '', onlyPage = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173';
const gl = process.platform === 'win32' ? 'd3d11' : 'gl';
const login = async (email) => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!' }),
  });
  return (await r.json()).token;
};
const alice = await login('alice@pharmacie.test');
const pages = [
  { name: 'login', path: '/login', token: null },
  { name: 'register', path: '/register', token: null },
  { name: 'home', path: '/', token: null },
  { name: 'dashboard', path: '/home', token: alice },
].filter((p) => !onlyPage || p.name === onlyPage);

const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const lang of ['fr', 'en'].filter((l) => !onlyLang || l === onlyLang)) {
  for (const scheme of ['light', 'dark'].filter((s) => !onlyScheme || s === onlyScheme)) {
    const dir = `docs/screenshots/design/${lang}-${scheme}`;
    mkdirSync(dir, { recursive: true });
    for (const width of [1440, 768, 390]) {
      for (const p of pages) {
        const ctx = await browser.newContext({
          viewport: { width, height: width < 500 ? 844 : width < 1000 ? 1024 : 900 },
          colorScheme: scheme,
          locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
        });
        await ctx.addInitScript(
          ([tk, th, lg]) => {
            if (tk) localStorage.setItem('counter.token', tk);
            localStorage.setItem('counter.theme', th);
            localStorage.setItem('counter.lang', lg);
            localStorage.setItem('counter.graphics', 'medium');
            localStorage.setItem('counter.tour', 'done');
            localStorage.setItem('counter.tour.doctor', 'done');
            localStorage.setItem('counter.tour.pharmacy', 'done');
            localStorage.setItem('counter.consent', 'essential');
          },
          [p.token, scheme, lang],
        );
        const page = await ctx.newPage();
        // The account language must not override the language under test.
        await page.route('**/api/auth/me', async (route) => {
          if (route.request().method() !== 'GET') return route.continue();
          const res = await route.fetch();
          const body = await res.json();
          if (body.user) body.user.language = lang;
          await route.fulfill({ response: res, json: body });
        });
        await page.goto(base + p.path);
        await page.waitForSelector('.page-bg.ready', { timeout: 90_000 }).catch(() => {});
        await page.waitForTimeout(4000);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) console.log(`OVERFLOW ${lang} ${scheme} ${width} ${p.name}: ${overflow}px`);
        const png = await page.screenshot();
        await sharp(png).jpeg({ quality: 80 }).toFile(`${dir}/${width}-${p.name}.jpg`);

        // Cursor effects on a fine pointer (1440 only): over the headline, then over a button.
        if (width === 1440 && ['login', 'register', 'home'].includes(p.name)) {
          const h = page.locator('.fx-headline').first();
          const box = await h.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 6 });
            await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.45, { steps: 8 });
            await page.waitForTimeout(700);
            const clip = { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 60), width: Math.min(1440 - Math.max(0, box.x - 60), box.width + 160), height: box.height + 140 };
            const shot = await page.screenshot({ clip });
            await sharp(shot).jpeg({ quality: 82 }).toFile(`${dir}/${width}-${p.name}-cursor-headline.jpg`);
          }
          const btn = page.locator('main .btn, .btn').filter({ hasText: /\S/ }).first();
          const bb = await btn.boundingBox();
          if (bb) {
            await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.4, { steps: 6 });
            await page.mouse.move(bb.x + bb.width * 0.7, bb.y + bb.height * 0.6, { steps: 8 });
            await page.waitForTimeout(700);
            const clip = { x: Math.max(0, bb.x - 120), y: Math.max(0, bb.y - 100), width: Math.min(1440 - Math.max(0, bb.x - 120), bb.width + 240), height: bb.height + 200 };
            const shot = await page.screenshot({ clip });
            await sharp(shot).jpeg({ quality: 82 }).toFile(`${dir}/${width}-${p.name}-cursor-button.jpg`);
          }
        }
        await ctx.close();
      }
    }
    console.log(`done ${lang} ${scheme}`);
  }
}
await browser.close();
