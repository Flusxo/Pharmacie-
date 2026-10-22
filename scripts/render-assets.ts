/**
 * Renders the picture library (frontend/src/render/library.ts) from our own 3D scenes and writes
 * optimised responsive images + blur placeholders. Uses the GPU when headless Chromium can (ANGLE),
 * otherwise RENDER_GL=swiftshader renders in software.
 *
 *   npm run dev            (in another terminal: the dev server serves the /render page)
 *   npm run render         (all missing pictures)
 *   npm run render -- hero-capsules cut-tube --force
 *
 * Output: frontend/public/renders/<id>-<width>.avif (+ one .webp fallback per picture) and
 * frontend/src/render/manifest.json (sizes, widths, blur placeholder, alpha). Headless Chromium renders
 * WebGL through ANGLE (or in software with RENDER_GL=swiftshader: slow but the same look).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { SHOTS, type Shot } from '../frontend/src/render/library';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'public', 'renders');
const MANIFEST = path.join(ROOT, 'frontend', 'src', 'render', 'manifest.json');
const BASE = process.env.RENDER_BASE_URL ?? 'http://localhost:5173';

export interface ManifestEntry {
  w: number;
  h: number;
  widths: number[];
  /** width of the WebP fallback */
  webp: number;
  /** tiny blurred WebP as a data URL (shown while the picture loads) */
  blur: string;
  alpha: boolean;
}

const widthsFor = (max: number) => (max === 3840 ? [480, 960, 1920, 3840] : max === 1920 ? [480, 960, 1920] : [400, 800, 1600]);
const webpFor = (max: number) => (max === 3840 ? 1920 : max === 1920 ? 960 : 800);

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));
  const shots = SHOTS.filter((s) => !only.length || only.includes(s.id));
  fs.mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, ManifestEntry> = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};

  try {
    const r = await fetch(BASE);
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    throw new Error(`The dev server is not reachable at ${BASE}. Start it with "npm run dev" first.`);
  }

  // The GPU through ANGLE (Direct3D 11 on Windows) is much faster; RENDER_GL=swiftshader forces software
  // rendering (any machine, slow, same look).
  const gl = process.env.RENDER_GL ?? (process.platform === 'win32' ? 'd3d11' : 'gl');
  const browser = await chromium.launch({
    args:
      gl === 'swiftshader'
        ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : [`--use-angle=${gl}`, '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    for (const shot of shots) {
      if (!force && manifest[shot.id] && fs.existsSync(path.join(OUT, `${shot.id}-${shot.width}.avif`))) {
        console.log(`skip ${shot.id} (exists; --force to redo)`);
        continue;
      }
      const t0 = Date.now();
      const png = await shoot(browser, shot);
      // A canvas that is too big for the GPU comes back empty (seen at 7680 px on an integrated GPU): never keep it.
      const { channels } = await sharp(png).stats();
      if (shot.bg !== 'transparent' && channels.slice(0, 3).every((c) => c.stdev < 1)) {
        throw new Error('The render of ' + shot.id + ' is blank (the GPU could not draw a canvas this big). Nothing was written.');
      }
      manifest[shot.id] = await encode(shot, png);
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`done ${shot.id} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  } finally {
    await browser.close();
  }
}

async function shoot(browser: import('@playwright/test').Browser, shot: Shot): Promise<Buffer> {
  const w = shot.width;
  const h = Math.round(w / shot.aspect);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`  page error (${shot.id}):`, String(e).slice(0, 300)));
  await page.goto(`${BASE}/render?shot=${encodeURIComponent(shot.id)}`);
  await page.waitForFunction(() => (window as unknown as { __renderReady?: boolean }).__renderReady === true, null, {
    timeout: 600_000,
    polling: 1000,
  });
  // Read the pixels from the canvas itself (preserveDrawingBuffer): a page screenshot of a huge
  // software-rendered canvas can stall the compositor.
  const dataUrl = await page.evaluate(() =>
    (document.querySelector('[data-testid="render-stage"] canvas') as HTMLCanvasElement).toDataURL('image/png'),
  );
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  await ctx.close();
  return png;
}

async function encode(shot: Shot, png: Buffer): Promise<ManifestEntry> {
  const alpha = shot.bg === 'transparent';
  const meta = await sharp(png).metadata();
  const widths = widthsFor(shot.width);
  for (const w of widths) {
    await sharp(png)
      .resize({ width: w })
      .avif({ quality: w >= 1920 ? 52 : 58, effort: 5 })
      .toFile(path.join(OUT, `${shot.id}-${w}.avif`));
  }
  const fallback = webpFor(shot.width);
  await sharp(png)
    .resize({ width: fallback })
    .webp({ quality: 80, alphaQuality: 90 })
    .toFile(path.join(OUT, `${shot.id}-${fallback}.webp`));
  const tiny = await sharp(png).resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
  return { w: meta.width!, h: meta.height!, widths, webp: fallback, blur: `data:image/webp;base64,${tiny.toString('base64')}`, alpha };
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
