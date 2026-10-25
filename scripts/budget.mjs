// Performance budget for the production build (frontend/dist). Fails when the first load or a lazy chunk grows past its
// limit, so a slow dependency cannot slip in. Sizes are gzip, which is what the network carries.
// usage: npm run build && node scripts/budget.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dist = 'frontend/dist/';
if (!existsSync(dist + 'index.html')) {
  console.error('No build found: run "npm run build" first.');
  process.exit(2);
}
const kb = (file) => gzipSync(readFileSync(dist + file)).length / 1024;
const index = readFileSync(dist + 'index.html', 'utf8');
const firstLoad = [...index.matchAll(/assets\/[^"]+\.(?:js|css)/g)].map((m) => m[0]);
const assets = readdirSync(dist + 'assets').filter((f) => /\.(js|css)$/.test(f));

// Limits (KB gzip). About 12% above the numbers measured on 2026-10-25 (see docs/PERF.md).
const LIMITS = {
  firstLoad: { label: 'first load (JS + CSS in index.html)', max: 260, now: firstLoad.reduce((s, f) => s + kb(f), 0) },
  lazyChunk: { label: 'any other single chunk', max: 60 },
  models: { label: '3D models chunk (lazy)', max: 265, match: /^models-/ },
  highEffects: { label: 'post-processing chunk (lazy)', max: 115, match: /^HighEffects-/ },
  map: { label: 'map chunk (lazy)', max: 55, match: /^PharmacyMap-/ },
  css: { label: 'stylesheet', max: 18, match: /\.css$/ },
};

let failed = 0;
const report = (label, now, max) => {
  const ok = now <= max;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(42)} ${now.toFixed(0).padStart(4)} KB  (limit ${max} KB)`);
};
report(LIMITS.firstLoad.label, LIMITS.firstLoad.now, LIMITS.firstLoad.max);
const special = ['models', 'highEffects', 'map', 'css'];
for (const key of special) {
  const L = LIMITS[key];
  for (const f of assets.filter((a) => L.match.test(a))) report(`${L.label}`, kb('assets/' + f), L.max);
}
const named = new Set(assets.filter((a) => special.some((k) => LIMITS[k].match.test(a))));
for (const f of assets.filter((a) => !named.has(a) && !firstLoad.includes('assets/' + a))) {
  const s = kb('assets/' + f);
  if (s > LIMITS.lazyChunk.max) report(`${LIMITS.lazyChunk.label}: ${f}`, s, LIMITS.lazyChunk.max);
}
console.log(failed ? `\n${failed} budget(s) exceeded.` : '\nAll budgets respected.');
process.exit(failed ? 1 : 0);
