// CPU profile of a page load on the production build: which functions own the main-thread time (self time).
// usage: node scripts/cpu-profile.mjs [path] [seconds]   (needs scripts/serve-prod.mjs on :4173)
import { chromium } from '@playwright/test';

const path = '/' + (process.argv[2] ?? '').replace(/^[\\/]+/, '');
const seconds = Number(process.argv[3] ?? 9);
const gl = process.env.RENDER_GL ?? (process.platform === 'win32' ? 'd3d11' : 'gl');
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('counter.tour', 'done'));
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
if (process.env.THROTTLE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await page.goto(`${process.env.BASE ?? 'http://localhost:4173'}${path}`, { waitUntil: 'load' });
await page.waitForTimeout(seconds * 1000);
const { profile } = await cdp.send('Profiler.stop');
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = nodes.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
});
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
for (const [k, ms] of top) console.log(`${ms.toFixed(0).padStart(6)} ms  ${k}`);
await browser.close();
