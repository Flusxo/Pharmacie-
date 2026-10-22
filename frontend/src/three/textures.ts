/**
 * Procedural canvas textures (no downloaded assets): labels, barcode, marble, foil crinkle and paper normals.
 * Every texture is cached by key and must be disposed by its owner via releaseTextures().
 */
import * as THREE from 'three';
import { labelFooter } from './labelFooter';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(key: string, c: HTMLCanvasElement, opts: { srgb?: boolean; anisotropy?: number; repeat?: number } = {}): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy ?? 8;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat, opts.repeat);
  }
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Label text uses the app font: wait until it is loaded before drawing any canvas texture. */
export function fontsReady(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all([document.fonts.load("800 64px 'Inter Variable'"), document.fonts.load("700 64px 'Inter Variable'")]).catch(
    () => undefined,
  );
}

/** Deterministic pseudo-random, so textures look the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Largest font size (px) that fits the width. Labels never crop text. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  start: number,
  weight = 700,
  family = 'Inter Variable, Inter, Arial, sans-serif',
): number {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW) return size;
    size -= 4;
  } while (size > 12);
  return size;
}

function greenCross(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#10B981') {
  ctx.fillStyle = color;
  const a = s / 3;
  ctx.beginPath();
  ctx.roundRect(x - a / 2, y - s / 2, a, s, a * 0.18);
  ctx.roundRect(x - s / 2, y - a / 2, s, a, a * 0.18);
  ctx.fill();
}

/** EAN-13-looking bars from the CIP digits (decorative). */
function barcode(ctx: CanvasRenderingContext2D, digits: string, x: number, y: number, w: number, h: number) {
  const bits: number[] = [1, 0, 1];
  for (const ch of digits.padEnd(12, '0').slice(0, 12)) {
    const d = Number(ch);
    for (let i = 0; i < 7; i++) bits.push(((d * 37 + i * 11) >> (i % 4)) & 1);
  }
  bits.push(1, 0, 1);
  const bw = w / bits.length;
  ctx.fillStyle = '#0F172A';
  bits.forEach((b, i) => b && ctx.fillRect(x + i * bw, y, Math.max(1, bw * 0.92), h));
  ctx.font = `600 ${Math.round(h * 0.22)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(digits, x + w / 2, y + h + h * 0.26);
}

export interface LabelSpec {
  name: string;
  dosage: string;
  cip?: string;
  color: string;
  light?: string;
  /** wrap-around label for bottles (wide) or a front panel for boxes */
  kind?: 'wrap' | 'panel';
}

/** 2048 px label: name, dosage, green cross, CIP code and a small barcode. Crisp thanks to anisotropic filtering. */
export function labelTexture(spec: LabelSpec, anisotropy = 8): THREE.Texture {
  const key = `label:${spec.kind ?? 'wrap'}:${spec.name}:${spec.dosage}:${spec.color}:${spec.cip ?? ''}:${labelFooter()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const wrap = (spec.kind ?? 'wrap') === 'wrap';
  const [c, ctx] = canvas(2048, wrap ? 1024 : 2048);
  const W = c.width;
  const H = c.height;
  // paper
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#F1F5F4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // colour band
  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, W, H * 0.16);
  ctx.fillRect(0, H * 0.9, W, H * 0.1);
  if (spec.light) {
    ctx.fillStyle = spec.light;
    ctx.fillRect(0, H * 0.16, W, H * 0.025);
  }
  // On a wrap label only the front third is visible: centre the text there.
  const cx = W / 2;
  const maxW = W * 0.8;
  greenCross(ctx, cx - maxW / 2 + 90, H * 0.3, wrap ? 150 : 170);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  const title = spec.name.replace(/\s+\d.*$/, '') || spec.name;
  const ts = fitText(ctx, title, maxW * 0.86, wrap ? 210 : 230);
  ctx.font = `800 ${ts}px Inter Variable, Inter, Arial, sans-serif`;
  ctx.fillText(title, cx, H * (wrap ? 0.47 : 0.42));
  ctx.fillStyle = spec.color;
  const ds = fitText(ctx, spec.dosage, maxW * 0.8, wrap ? 140 : 160, 700);
  ctx.font = `700 ${ds}px Inter Variable, Inter, Arial, sans-serif`;
  ctx.fillText(spec.dosage, cx, H * (wrap ? 0.6 : 0.55));
  if (spec.cip) barcode(ctx, spec.cip, cx - maxW * 0.22, H * 0.665, maxW * 0.44, H * (wrap ? 0.12 : 0.1));
  ctx.textAlign = 'left';
  ctx.font = `600 ${wrap ? 36 : 54}px Inter Variable, Inter, Arial, sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(labelFooter(), 40, H * 0.955);
  return finish(key, c, { anisotropy });
}

/** Pharmacy box for the shelf: fictional brand, colour band, cross. */
export function boxTexture(brand: string, color: string, anisotropy = 4): THREE.Texture {
  const key = `box:${brand}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 150);
  ctx.fillRect(0, 470, 512, 42);
  greenCross(ctx, 70, 230, 70);
  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  const s = fitText(ctx, brand, 440, 92, 800);
  ctx.font = `800 ${s}px Inter Variable, Inter, Arial, sans-serif`;
  ctx.fillText(brand, 256, 330);
  return finish(key, c, { anisotropy });
}

/** Soft white marble with grey veins (counter top). */
export function marbleTexture(): THREE.Texture {
  const key = 'marble';
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(1024, 1024);
  ctx.fillStyle = '#F4F2EE';
  ctx.fillRect(0, 0, 1024, 1024);
  const r = rng(7);
  for (let v = 0; v < 18; v++) {
    ctx.strokeStyle = `rgba(110, 112, 118, ${0.05 + r() * 0.14})`;
    ctx.lineWidth = 0.6 + r() * 3.2;
    ctx.beginPath();
    let x = r() * 1024;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < 1024) {
      x += (r() - 0.5) * 60 + Math.sin(y / 90) * 8;
      y += 14 + r() * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(key, c, { anisotropy: 8 });
}

/** Tangent-space normal map from a height function (foil crinkle, paper grain). */
function normalFromHeight(
  key: string,
  size: number,
  height: (x: number, y: number) => number,
  strength: number,
  repeat: number,
): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const rr = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      const nx = (l - rr) * strength;
      const ny = (u - d) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return finish(key, c, { srgb: false, repeat });
}

export function foilNormal(): THREE.Texture {
  const r = rng(11);
  const pts = Array.from({ length: 40 }, () => [r() * 256, r() * 256, 10 + r() * 40, r() - 0.5]);
  return normalFromHeight(
    'foil',
    256,
    (x, y) => pts.reduce((s, [px, py, rad, a]) => s + a * Math.max(0, 1 - Math.hypot(x - px, y - py) / rad), 0),
    3.5,
    2,
  );
}

export function paperNormal(): THREE.Texture {
  const r = rng(5);
  const noise = Array.from({ length: 128 * 128 }, () => r());
  return normalFromHeight('paper', 128, (x, y) => noise[(y % 128) * 128 + (x % 128)] * 0.6, 1.2, 6);
}

/** Dispose every cached texture (called when the last 3D canvas unmounts). */
export function releaseTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
