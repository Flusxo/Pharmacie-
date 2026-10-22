// Measures the frame rate of the 3D layer on a running dev server (npm run dev), in headless Chromium
// with the machine's GPU (ANGLE). Usage: node scripts/measure-fps.mjs [high|medium] [width]
// Prints, per page, the average frames per second over 10 s (after 6 s of warm-up), and the tier the
// governor ended on (it must not have dropped).
import { chromium } from '@playwright/test';

const [, , tier = 'high', width = '1440', only = ''] = process.argv;
const base = 'http://localhost:5173';
const gl = process.env.RENDER_GL ?? (process.platform === 'win32' ? 'd3d11' : 'gl');
const pages = [
  [null, '/'],
  [null, '/pharmacies'],
  [null, '/login'],
  ['alice@pharmacie.test', '/home'],
  ['alice@pharmacie.test', '/search?q=doli'],
  ['alice@pharmacie.test', '/map'],
  ['pharmacie.tournon@pharmacie.test', '/pharmacy'],
  ['admin@pharmacie.test', '/admin'],
];
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const W = Number(width);
const results = [];
for (const [who, path] of pages.filter(([, p]) => !only || p === only || p === '/' + only || (only === 'root' && p === '/'))) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 800 : 900 } });
  let token = null;
  if (who) {
    const r = await ctx.request.post(`${base}/api/auth/login`, { data: { email: who, password: 'Password123!' } });
    token = (await r.json()).token;
  }
  await ctx.addInitScript(
    ([tk, t]) => {
      if (tk) localStorage.setItem('counter.token', tk);
      localStorage.setItem('counter.graphics', t);
      localStorage.setItem('counter.tour', 'done');
    },
    [token, tier],
  );
  const page = await ctx.newPage();
  await page.goto(base + path);
  await page.waitForSelector('.page-bg.ready', { timeout: 60_000 });
  await page.waitForTimeout(6000);
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const start = performance.now();
        const tick = () => {
          n += 1;
          if (performance.now() - start < 10_000) requestAnimationFrame(tick);
          else resolve((n / (performance.now() - start)) * 1000);
        };
        requestAnimationFrame(tick);
      }),
  );
  const canvases = await page.locator('canvas').count();
  results.push({ path, fps: Math.round(fps * 10) / 10, canvases });
  console.log(`${tier} ${W}px ${path}: ${fps.toFixed(1)} fps (${canvases} canvas)`);
  await ctx.close();
}
const avg = results.reduce((s, r) => s + r.fps, 0) / results.length;
console.log(`AVERAGE ${tier} ${W}px: ${avg.toFixed(1)} fps`);
await browser.close();
