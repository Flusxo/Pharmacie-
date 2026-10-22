import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Reads the colour tokens of a theme block in app.css. */
function tokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const css = fs.readFileSync(path.resolve(__dirname, '../styles/app.css'), 'utf8');
const light = tokens(css, ':root');
const dark = { ...light, ...tokens(css, ":root[data-theme='dark']") };

describe('palette contrast (WCAG AA, 4.5:1 for text)', () => {
  for (const [name, t] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`${name}: text, muted text and links on page, cards and tinted surfaces`, () => {
      for (const fg of ['ink', 'ink-2', 'muted', 'brand']) {
        for (const bg of ['bg', 'surface', 'surface-2']) {
          expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(t['brand-ink'], t.brand), 'button text on brand').toBeGreaterThanOrEqual(4.5);
    });
  }
});
