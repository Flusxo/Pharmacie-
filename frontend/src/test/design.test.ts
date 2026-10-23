import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fr from '../i18n/locales/fr.json';
import en from '../i18n/locales/en.json';
import manifest from '../render/manifest.json';

const SRC = path.resolve(__dirname, '..');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));

describe('removed design: the "all shapes, all colours" gallery and the framed pictures', () => {
  it('the section, its captions and its pictures exist nowhere: not in the code, the translations or the build', () => {
    const code = files(SRC)
      .filter((f) => /\.(tsx?|css)$/.test(f) && !/[\\/]test[\\/]design\.test\.ts$/.test(f))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    for (const word of [
      '<Gallery',
      'ImageBand',
      'picture-band',
      'pub.gallery',
      'pub.formsTitle',
      'scene-rainbow',
      'scene-amber-bottles',
      'scene-vitamins',
    ]) {
      expect(code.includes(word), word).toBe(false);
    }
    expect(/\bGallery\(/.test(code), 'a Gallery component').toBe(false);
    for (const dict of [fr, en] as Record<string, string>[]) {
      const text = Object.entries(dict)
        .map(([k, v]) => `${k} ${v}`)
        .join('\n');
      expect(text).not.toMatch(
        /Toutes les formes, toutes les couleurs|Every form, every colour|Images de synthèse issues|Pictures rendered from our own 3D scenes/,
      );
      expect(Object.keys(dict).filter((k) => /^pub\.(gallery|band)\./.test(k))).toEqual([]);
    }
    for (const id of ['scene-rainbow', 'scene-amber-bottles', 'scene-vitamins']) {
      expect(id in manifest).toBe(false);
      expect(fs.existsSync(path.resolve(SRC, '..', 'public', 'renders', `${id}-960.avif`))).toBe(false);
    }
  });

  it('no opaque, framed picture is left: every rendered picture is a transparent cut-out (objects sit on the page)', () => {
    const opaque = Object.entries(manifest as Record<string, { alpha: boolean }>).filter(([, e]) => !e.alpha);
    expect(opaque.map(([id]) => id)).toEqual([]);
  });
});
