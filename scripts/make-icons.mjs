// PNG app icons for "Add to Home Screen" (iOS needs a PNG apple-touch-icon) drawn from public/favicon.svg.
// usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('frontend/public/favicon.svg', 'utf8');
const b = await chromium.launch();
for (const [size, name] of [
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#065F46">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: `frontend/public/${name}` });
  await p.close();
}
await b.close();
