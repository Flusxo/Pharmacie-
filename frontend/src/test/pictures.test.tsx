import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import manifest from '../render/manifest.json';
import { SHOTS } from '../render/library';
import { Picture } from '../components/Picture';
import { SettingsProvider } from '../lib/settings';

const PUBLIC = path.resolve(__dirname, '../../public/renders');

describe('rendered pictures', () => {
  it('every library shot is rendered, with every AVIF width, the WebP fallback and a blur placeholder', () => {
    for (const shot of SHOTS) {
      const e = (manifest as Record<string, { widths: number[]; webp: number; blur: string; w: number }>)[shot.id];
      expect(e, shot.id).toBeTruthy();
      expect(e.w).toBe(shot.width);
      for (const w of e.widths) expect(fs.existsSync(path.join(PUBLIC, `${shot.id}-${w}.avif`)), `${shot.id}-${w}.avif`).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC, `${shot.id}-${e.webp}.webp`))).toBe(true);
      expect(e.blur).toMatch(/^data:image\/webp;base64,/);
    }
  });

  it('builds a responsive, lazy picture and renders nothing for an unknown id', () => {
    const { container, rerender } = render(
      <SettingsProvider>
        <Picture id="cut-syrup" alt="Syrup bottle" />
      </SettingsProvider>,
    );
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBe('Syrup bottle');
    expect(container.querySelector('source')!.getAttribute('srcset')).toContain('cut-syrup-1600.avif 1600w');
    rerender(
      <SettingsProvider>
        <Picture id="does-not-exist" alt="" />
      </SettingsProvider>,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
