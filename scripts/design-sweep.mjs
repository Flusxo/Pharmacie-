// Design-pass sweep against the running dev server (npm run dev): scrolled viewport frames of the main pages.
// usage: node scripts/design-sweep.mjs <outDir> <widths comma> <light|dark> <fr|en> [filter]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , out, widthsArg = '360,768,1440', scheme = 'light', lang = 'fr', filter = ''] = process.argv;
const base = 'http://localhost:5173';
mkdirSync(out, { recursive: true });
const pages = [
  { who: null, name: 'login', path: '/login' },
  { who: null, name: 'register', path: '/register' },
  { who: 'alice@pharmacie.test', name: 'home', path: '/home' },
  { who: 'alice@pharmacie.test', name: 'search', path: '/search?q=doli' },
  { who: 'alice@pharmacie.test', name: 'details', path: '/search?q=Hélicidine', click: 'medicine-card' },
  { who: 'alice@pharmacie.test', name: 'requests', path: '/requests' },
  { who: 'alice@pharmacie.test', name: 'tracking', path: '/requests', link: /\/orders\// },
  { who: 'alice@pharmacie.test', name: 'map', path: '/map' },
  { who: 'alice@pharmacie.test', name: 'profile', path: '/profile' },
  { who: 'pharmacie.tournon@pharmacie.test', name: 'pharmacy', path: '/pharmacy' },
  { who: 'dr.martin@pharmacie.test', name: 'doctor', path: '/doctor' },
  { who: 'admin@pharmacie.test', name: 'admin', path: '/admin' },
];
const b = await chromium.launch();
const tokens = {};
for (const width of widthsArg.split(',').map(Number)) {
  for (const pg of pages) {
    if (filter && !pg.name.includes(filter)) continue;
    const ctx = await b.newContext({ viewport: { width, height: width < 500 ? 780 : 900 }, colorScheme: scheme, locale: lang === 'fr' ? 'fr-FR' : 'en-GB' });
    let token = null;
    if (pg.who) {
      if (!tokens[pg.who]) {
        const r = await ctx.request.post(`${base}/api/auth/login`, { data: { email: pg.who, password: 'Password123!' } });
        tokens[pg.who] = (await r.json()).token;
      }
      token = tokens[pg.who];
    }
    await ctx.addInitScript(
      ([tk, lg]) => {
        if (tk) localStorage.setItem('counter.token', tk);
        localStorage.setItem('counter.graphics', 'off');
        localStorage.setItem('counter.lang', lg);
      },
      [token, lang],
    );
    const p = await ctx.newPage();
    try {
      await p.goto(base + pg.path);
      await p.waitForLoadState('networkidle');
      if (pg.click) {
        await p.getByTestId(pg.click).first().click();
        await p.waitForLoadState('networkidle');
      }
      if (pg.link) {
        const href = await p.evaluate((src) => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).find((h) => h && new RegExp(src).test(h)), pg.link.source);
        if (href) {
          await p.goto(base + href);
          await p.waitForLoadState('networkidle');
        }
      }
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(900);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      // Viewport frames while scrolling (full-page captures distort 100vh/sticky/fixed layouts), laid side by side.
      const vh = p.viewportSize().height;
      const total = await p.evaluate(() => document.documentElement.scrollHeight);
      const frames = [];
      for (let y = 0, i = 0; i < 8; y += vh * 0.9, i++) {
        await p.evaluate((yy) => window.scrollTo(0, yy), y);
        await p.waitForTimeout(500);
        frames.push((await p.screenshot()).toString('base64'));
        if (y + vh >= total) break;
      }
      const strip = await ctx.newPage();
      await strip.setViewportSize({ width: Math.min(frames.length * (width + 8), 6000), height: vh });
      await strip.setContent(`<body style="margin:0;display:flex;gap:8px;background:#f0f">${frames.map((f) => `<img src="data:image/png;base64,${f}" style="width:${width}px;height:${vh}px">`).join('')}</body>`);
      await strip.screenshot({ path: `${out}/${pg.name}-${width}-${scheme}-${lang}.png` });
      console.log(pg.name, width, scheme, lang, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : 'ok');
    } catch (e) {
      console.log(pg.name, width, 'ERROR', String(e).slice(0, 200));
    }
    await ctx.close();
  }
}
await b.close();
