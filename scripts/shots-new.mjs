// Screenshots of the screens added in the 2026-10-25/26 rounds, at 1440, 768 and 390 px, light and dark, French and
// English, on the running dev server (npm run dev). Reports horizontal overflow (clipping).
// usage: node scripts/shots-new.mjs [lang] [scheme]   -> docs/screenshots/new/<lang>-<scheme>/<width>-<screen>.jpg
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const [, , onlyLang = '', onlyScheme = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173';
const login = async (email) => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!' }),
  });
  return (await r.json()).token;
};
const get = async (token, path) => (await fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();

const tokens = {
  alice: await login('alice@pharmacie.test'),
  romans: await login('pharmacie.romans@pharmacie.test'),
  tournon: await login('pharmacie.tournon@pharmacie.test'),
  admin: await login('admin@pharmacie.test'),
};
const nearby = await get(tokens.alice, '/pharmacies/nearby?lat=45.07&lon=4.83&radiusKm=30');
const profileId = nearby.items[0].id;
const orders = await get(tokens.alice, '/patient/orders');
const open = (orders.items ?? []).find((o) => ['accepted', 'preparing', 'ready'].includes(o.status));

const tab = (fr, en) => async (p, lang) => p.getByRole('tab', { name: lang === 'fr' ? fr : en }).click();
const screens = [
  { name: 'pharmacy-profile', who: null, path: `/pharmacies/${profileId}` },
  { name: 'consent-banner', who: null, path: '/', consent: false },
  { name: 'style-guide', who: 'admin', path: '/admin/design' },
  { name: 'analytics-integrations', who: 'admin', path: '/admin', after: tab('Statistiques', 'Analytics') },
  { name: 'board-today', who: 'romans', path: '/pharmacy', after: tab('Aujourd’hui', 'Today') },
  { name: 'pharmacy-profile-tab', who: 'romans', path: '/pharmacy', after: tab('Fiche', 'Profile') },
  { name: 'team-tab', who: 'tournon', path: '/pharmacy', after: tab('Équipe', 'Team') },
  { name: 'account-devices', who: 'alice', path: '/profile' },
  { name: 'palette', who: 'alice', path: '/home', after: async (p) => p.keyboard.press('Control+k') },
  { name: 'map-route', who: 'alice', path: '/map', after: async (p) => p.getByTestId('map-list-item').first().click() },
  { name: 'empty-search', who: 'alice', path: '/search?q=zzzzqq' },
  ...(open ? [{ name: 'order-pickup-code', who: 'alice', path: `/orders/${open.id}` }] : []),
];

const browser = await chromium.launch();
const report = [];
for (const lang of ['fr', 'en'].filter((l) => !onlyLang || l === onlyLang)) {
  for (const scheme of ['light', 'dark'].filter((s) => !onlyScheme || s === onlyScheme)) {
    const dir = `docs/screenshots/new/${lang}-${scheme}`;
    mkdirSync(dir, { recursive: true });
    for (const width of [1440, 768, 390]) {
      for (const s of screens) {
        const ctx = await browser.newContext({
          viewport: { width, height: width < 500 ? 800 : width < 1000 ? 1024 : 900 },
          colorScheme: scheme,
          locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
        });
        await ctx.addInitScript(
          ([tk, th, lg, consent]) => {
            if (tk) localStorage.setItem('counter.token', tk);
            localStorage.setItem('counter.theme', th);
            localStorage.setItem('counter.lang', lg);
            localStorage.setItem('counter.graphics', 'off');
            localStorage.setItem('counter.tour', 'done');
            localStorage.setItem('counter.tour.doctor', 'done');
            localStorage.setItem('counter.tour.pharmacy', 'done');
            if (consent) localStorage.setItem('counter.consent', 'essential');
          },
          [s.who ? tokens[s.who] : null, scheme, lang, s.consent !== false],
        );
        const page = await ctx.newPage();
        // A logged-in account's own language wins over the browser: show the language under test without touching the account.
        await page.route('**/api/auth/me', async (route) => {
          if (route.request().method() !== 'GET') return route.continue();
          const res = await route.fetch();
          const body = await res.json();
          if (body.user) body.user.language = lang;
          await route.fulfill({ response: res, json: body });
        });
        try {
          await page.goto(base + s.path);
          await page.waitForTimeout(1800);
          if (s.after) await s.after(page, lang);
          await page.waitForTimeout(1200);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          const png = await page.screenshot();
          await sharp(png).jpeg({ quality: 78 }).toFile(`${dir}/${width}-${s.name}.jpg`);
          report.push({ lang, scheme, width, screen: s.name, overflow });
          if (overflow > 1) console.log(`OVERFLOW ${lang} ${scheme} ${width} ${s.name}: ${overflow}px`);
        } catch (e) {
          console.log(`FAILED ${lang} ${scheme} ${width} ${s.name}: ${String(e.message).split('\n')[0]}`);
        }
        await ctx.close();
      }
    }
    console.log(`done ${lang} ${scheme}`);
  }
}
writeFileSync(`docs/screenshots/new/report-${onlyLang || 'all'}-${onlyScheme || 'all'}.json`, JSON.stringify(report, null, 1));
await browser.close();
