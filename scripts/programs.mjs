// How many WebGL shader programs does a page compile? (each one costs ~100 ms on an integrated GPU)
import { chromium } from '@playwright/test';
const path = '/' + (process.argv[2] ?? '').replace(/^\/+/, '');
const base = process.env.BASE ?? 'http://localhost:4173';
const gl = process.platform === 'win32' ? 'd3d11' : 'gl';
const browser = await chromium.launch({ args: [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('counter.tour', 'done'));
const page = await ctx.newPage();
await page.goto(base + path);
await page.waitForFunction(() => document.documentElement.dataset.stage === '3d', null, { timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const st = window.__stage;
  if (!st) return { error: 'no stage' };
  const { gl, scene } = st;
  let meshes = 0;
  const mats = new Set();
  scene.traverse((o) => {
    if (o.isMesh || o.isPoints) {
      meshes++;
      [].concat(o.material).forEach((m) => m && mats.add(m));
    }
  });
  return {
    programs: gl.info.programs.length,
    materials: mats.size,
    meshes,
    drawCalls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    textures: gl.info.memory.textures,
    geometries: gl.info.memory.geometries,
    dpr: gl.getPixelRatio(),
  };
});
console.log(JSON.stringify(info));
await browser.close();
