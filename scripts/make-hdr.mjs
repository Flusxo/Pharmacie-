/**
 * Generates frontend/public/hdr/studio.hdr: a procedural photo-studio environment (equirectangular,
 * Radiance RGBE). Soft key box, overhead box, rim strip, cool fill, warm floor bounce.
 * Own work, released as CC0 (see docs/ASSETS.md). Run: node scripts/make-hdr.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 512;
const H = 256;

// Lights in (longitude, latitude) degrees, with angular size and colour * intensity.
const LIGHTS = [
  { lon: -50, lat: 35, w: 50, h: 34, c: [14, 13.5, 12.5] }, // key softbox, front-left
  { lon: 0, lat: 78, w: 70, h: 18, c: [6, 6, 6] }, // overhead
  { lon: 130, lat: 18, w: 10, h: 48, c: [9, 9.5, 10] }, // rim strip, back-right
  { lon: 75, lat: 20, w: 40, h: 26, c: [1.6, 1.9, 2.2] }, // cool fill
  { lon: -150, lat: 10, w: 30, h: 30, c: [1.2, 2.0, 1.5] }, // faint green bounce (brand)
];

function smoothRect(dLon, dLat, w, h) {
  const fx = Math.max(0, 1 - Math.max(0, Math.abs(dLon) - w / 2) / 8);
  const fy = Math.max(0, 1 - Math.max(0, Math.abs(dLat) - h / 2) / 8);
  return fx * fy;
}

function radiance(lon, lat) {
  // Background: soft grey sky, warm darker floor.
  const t = (lat + 90) / 180;
  let r = 0.18 + 0.32 * t;
  let g = 0.19 + 0.33 * t;
  let b = 0.2 + 0.34 * t;
  if (lat < 0) {
    const f = Math.min(1, -lat / 30);
    r = r * (1 - f) + 0.26 * f;
    g = g * (1 - f) + 0.23 * f;
    b = b * (1 - f) + 0.2 * f;
  }
  for (const L of LIGHTS) {
    let dLon = lon - L.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const k = smoothRect(dLon, lat - L.lat, L.w, L.h);
    r += L.c[0] * k;
    g += L.c[1] * k;
    b += L.c[2] * k;
  }
  return [r, g, b];
}

function rgbe([r, g, b]) {
  const v = Math.max(r, g, b);
  if (v < 1e-32) return [0, 0, 0, 0];
  const e = Math.ceil(Math.log2(v + 1e-12));
  const scale = 256 / 2 ** e;
  return [Math.min(255, Math.floor(r * scale)), Math.min(255, Math.floor(g * scale)), Math.min(255, Math.floor(b * scale)), e + 128];
}

const header = Buffer.from(`#?RADIANCE\n# counter. procedural studio, CC0\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'ascii');
const data = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 360 - 180;
    const px = rgbe(radiance(lon, lat));
    data.set(px, (y * W + x) * 4);
  }
}
// Flat (non-RLE) scanlines; readers detect this because a line does not start with 2,2.
if (data[0] === 2 && data[1] === 2) data[0] = 3;
const out = path.join(ROOT, 'frontend', 'public', 'hdr', 'studio.hdr');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`wrote ${path.relative(ROOT, out)} (${W}x${H}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
