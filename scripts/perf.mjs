// Real-browser performance measurement of the PRODUCTION build (scripts/serve-prod.mjs on :4173), with the machine's GPU
// through ANGLE. Profiles: "laptop" (no throttling: this machine, Intel UHD 620) and "phone" (390 px, CPU x4, slow 4G).
// Reports per page: first contentful paint, largest contentful paint, load, layout shift, long tasks (count and
// total blocking time), bytes by type, time until the live 3D is visible, and the frame rate once it runs.
// usage: node scripts/perf.mjs <tag> [laptop|phone] [pageFilter] [base]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [, , tag = 'run', profile = 'laptop', only = '', baseArg] = process.argv;
const base = baseArg ?? 'http://localhost:4173';
const api = 'http://localhost:4000';
const gl = process.env.RENDER_GL ?? (process.platform === 'win32' ? 'd3d11' : 'gl');
const phone = profile === 'phone';
const pages = [
  [null, 'home', '/'],
  [null, 'login', '/login'],
  ['alice@pharmacie.test', 'search', '/search?q=doli'],
  ['alice@pharmacie.test', 'medicine', '/search?q=Doliprane', 'medicine-card'],
];
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
// The first WebGL context of a browser start takes ~2 s (GPU process start-up): do it before measuring.
const warm = await browser.newPage();
await warm.goto('about:blank');
await warm.evaluate(() => document.createElement('canvas').getContext('webgl2'));
await warm.close();
const results = [];
for (const [who, name, path, click] of pages.filter(([, n]) => !only || n === only)) {
  let token = null;
  if (who) {
    const r = await fetch(`${api}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: who, password: 'Password123!' }),
    });
    token = (await r.json()).token;
  }
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  await ctx.addInitScript(
    ([tk, gfx]) => {
      try {
        if (tk) localStorage.setItem('counter.token', tk);
        localStorage.setItem('counter.tour', 'done');
        localStorage.setItem('counter.tour.doctor', 'done');
        localStorage.setItem('counter.tour.pharmacy', 'done');
        localStorage.setItem('counter.consent', 'essential');
        if (gfx) localStorage.setItem('counter.graphics', gfx);
      } catch {
        /* storage blocked */
      }
      const p = (window.__perf = { lcp: 0, cls: 0, longtasks: [], fcp: 0, stage3d: 0, canvasAt: 0 });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (p.lcp = e.startTime))).observe({
        type: 'largest-contentful-paint',
        buffered: true,
      });
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => {
          if (e.hadRecentInput) return;
          p.cls += e.value;
          (p.shifts ??= []).push([
            Math.round(e.startTime),
            Math.round(e.value * 1000) / 1000,
            String(e.sources?.[0]?.node?.nodeName ?? '') + '.' + String(e.sources?.[0]?.node?.className ?? '').slice(0, 30),
          ]);
        }),
      ).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => p.longtasks.push([e.startTime, e.duration]))).observe({
        type: 'longtask',
        buffered: true,
      });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => e.name === 'first-contentful-paint' && (p.fcp = e.startTime))).observe({
        type: 'paint',
        buffered: true,
      });
      setInterval(() => {
        if (!p.stage3d && document.documentElement.dataset.stage === '3d') p.stage3d = performance.now();
        if (!p.canvasAt && document.querySelector('[data-testid="root-stage"] canvas')) p.canvasAt = performance.now();
      }, 40);
    },
    [token, process.env.GRAPHICS ?? null],
  );
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (phone) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Slow 4G profile (Lighthouse "mobile"): 1.6 Mbps down, 750 kbps up, 150 ms RTT.
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: 'load', timeout: 120_000 });
  const loadMs = Date.now() - t0;
  if (click) {
    await page.getByTestId(click).first().click();
  }
  // Give the live 3D time to appear (the page is usable before), then measure the frame rate for 6 s.
  await page
    .waitForFunction((skip) => skip || window.__perf.stage3d > 0, ['low', 'off'].includes(process.env.GRAPHICS ?? ''), {
      timeout: phone ? 90_000 : 60_000,
    })
    .catch(() => {});
  await page.waitForTimeout(3000);
  const data = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        const bytes = { js: 0, css: 0, img: 0, font: 0, other: 0, total: 0 };
        for (const r of res) {
          const b = r.transferSize || r.encodedBodySize || 0;
          const k = /\.js(\?|$)/.test(r.name)
            ? 'js'
            : /\.css/.test(r.name)
              ? 'css'
              : /\.(avif|webp|png|jpe?g|svg)/.test(r.name)
                ? 'img'
                : /\.woff2/.test(r.name)
                  ? 'font'
                  : 'other';
          bytes[k] += b;
          bytes.total += b;
        }
        const p = window.__perf;
        const blocking = p.longtasks.filter(([s]) => s >= p.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
        let n = 0;
        let worst = 0;
        let last = performance.now();
        const start = last;
        const tick = (now) => {
          n += 1;
          worst = Math.max(worst, now - last);
          last = now;
          if (now - start < 6000) requestAnimationFrame(tick);
          else
            resolve({
              ttfb: Math.round(nav.responseStart),
              dcl: Math.round(nav.domContentLoadedEventEnd),
              fcp: Math.round(p.fcp),
              lcp: Math.round(p.lcp),
              cls: Math.round(p.cls * 1000) / 1000,
              shifts: p.shifts ?? [],
              longTasks: p.longtasks.length,
              longList: p.longtasks.map(([s, d]) => [Math.round(s), Math.round(d)]),
              tbt: Math.round(blocking),
              stage3dAt: Math.round(p.stage3d),
              canvasAt: Math.round(p.canvasAt),
              fps: Math.round((n / (now - start)) * 10000) / 10,
              worstFrameMs: Math.round(worst),
              kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])),
              requests: res.length,
              canvases: document.querySelectorAll('canvas').length,
              tier: localStorage.getItem('counter.graphics') ?? 'auto',
            });
        };
        requestAnimationFrame(tick);
      }),
  );
  const row = { page: name, profile, loadMs, ...data };
  results.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
mkdirSync('docs/perf', { recursive: true });
writeFileSync(`docs/perf/${tag}-${profile}.json`, JSON.stringify(results, null, 2));
