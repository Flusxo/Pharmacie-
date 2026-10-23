// Screenshots of 10 pages at 1440, 768 and 390 px, light and dark, French and English, on the running dev server
// (npm run dev), GPU through ANGLE, graphics Medium. Reports clipped/overflowing pages. JPEG to keep the repository light.
// usage: node scripts/shots-matrix.mjs [lang] [scheme]   -> docs/screenshots/matrix/<lang>-<scheme>/<width>-<page>.jpg
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const [, , onlyLang = '', onlyScheme = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173';
const gl = process.platform === 'win32' ? 'd3d11' : 'gl';
const pages = [
  [null, 'home', '/'],
  [null, 'how', '/how-it-works'],
  [null, 'patients', '/patients'],
  [null, 'login', '/login'],
  [null, 'register', '/register'],
  ['alice@pharmacie.test', 'search', '/search?q=doli'],
  ['alice@pharmacie.test', 'medicine', '/search?q=Doliprane', 'medicine-card'],
  ['alice@pharmacie.test', 'map', '/map'],
  ['pharmacie.tournon@pharmacie.test', 'pharmacy', '/pharmacy'],
  ['admin@pharmacie.test', 'admin', '/admin'],
];
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const tokens = {};
const report = [];
for (const lang of ['fr', 'en'].filter((l) => !onlyLang || l === onlyLang)) {
  for (const scheme of ['light', 'dark'].filter((s) => !onlyScheme || s === onlyScheme)) {
    const dir = `docs/screenshots/matrix/${lang}-${scheme}`;
    mkdirSync(dir, { recursive: true });
    for (const width of [1440, 768, 390]) {
      for (const [who, name, path, click] of pages) {
        if (who && !tokens[who]) {
          const r = await fetch(`${base}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: who, password: 'Password123!' }),
          });
          tokens[who] = (await r.json()).token;
        }
        const ctx = await browser.newContext({
          viewport: { width, height: width < 500 ? 800 : width < 1000 ? 1024 : 900 },
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
          },
          [who ? tokens[who] : null, scheme, lang],
        );
        const page = await ctx.newPage();
        await page.goto(base + path);
        await page.waitForSelector('.page-bg.ready', { timeout: 90_000 }).catch(() => {});
        if (click) await page.getByTestId(click).first().click();
        await page.waitForTimeout(3500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const png = await page.screenshot();
        await sharp(png).jpeg({ quality: 78 }).toFile(`${dir}/${width}-${name}.jpg`);
        report.push({ lang, scheme, width, page: name, overflow });
        if (overflow > 1) console.log(`OVERFLOW ${lang} ${scheme} ${width} ${name}: ${overflow}px`);
        await ctx.close();
      }
    }
    console.log(`done ${lang} ${scheme}`);
  }
}
writeFileSync(`docs/screenshots/matrix/report-${onlyLang || 'all'}-${onlyScheme || 'all'}.json`, JSON.stringify(report, null, 1));
await browser.close();
