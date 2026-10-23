import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MEDICINES } from '../../../db/src/data';
import { estimateWidth, fitLabel, packTitle } from '../lib/labelFit';
import { LAYOUTS, PackImage, layoutFor } from '../components/PackImage';

describe('pack labels', () => {
  it('every seeded medicine fits inside its label (width, height, at most 3 + 2 lines, readable size)', () => {
    for (const m of MEDICINES) {
      const box = layoutFor(m.form).text;
      const lines = fitLabel(packTitle(m.name), m.dosage, box, { measure: estimateWidth });
      const where = `${m.name} (${m.form})`;
      expect(lines.length, where).toBeGreaterThan(0);
      expect(lines.filter((l) => l.weight === 700).length, where).toBeLessThanOrEqual(3);
      expect(lines.filter((l) => l.weight === 600).length, where).toBeLessThanOrEqual(2);
      for (const l of lines) {
        expect(estimateWidth(l.text, l.size, l.weight), `${where}: "${l.text}" too wide`).toBeLessThanOrEqual(box.w);
        expect(l.y - l.size * 0.96, `${where}: "${l.text}" above the box`).toBeGreaterThanOrEqual(box.y - 0.5);
        expect(l.y + l.size * 0.24, `${where}: "${l.text}" below the box`).toBeLessThanOrEqual(box.y + box.h + 0.5);
        expect(l.size, `${where}: "${l.text}" too small to read`).toBeGreaterThanOrEqual(7);
      }
      // Nothing is dropped: every word of the title and dosage is printed.
      const printed = lines.map((l) => l.text).join(' ');
      expect(printed, where).toBe(`${packTitle(m.name)} ${m.dosage}`.replace(/\s+/g, ' ').trim());
    }
  });

  it('text areas sit inside the white labels', () => {
    for (const [form, { label, text }] of Object.entries(LAYOUTS)) {
      expect(text.x, form).toBeGreaterThanOrEqual(label.x);
      // Below the 12-unit brand band at the top of the label.
      expect(text.y, form).toBeGreaterThanOrEqual(label.y + 14);
      expect(text.x + text.w, form).toBeLessThanOrEqual(label.x + label.w);
      expect(text.y + text.h, form).toBeLessThanOrEqual(label.y + label.h);
    }
  });

  it('a very long name shrinks and wraps instead of overflowing', () => {
    const box = LAYOUTS.cream.text;
    const lines = fitLabel('Hydrocortisone Kerapharm Dermatologique Apaisante Extra', '0,5 % / 1 % / 2 %', box, { measure: estimateWidth });
    for (const l of lines) expect(estimateWidth(l.text, l.size, l.weight)).toBeLessThanOrEqual(box.w);
    expect(lines.map((l) => l.text).join(' ')).toContain('Apaisante');
  });

  it('prints the Rx mark only for prescription medicines', () => {
    const { container, rerender } = render(
      <PackImage name="Testocillin Forte" dosage="1 g / 125 mg" form="sachet" category="antibiotics" rx />,
    );
    expect(container.textContent).toContain('Rx');
    rerender(<PackImage name="Testosmecta" dosage="3 g" form="sachet" category="digestion" />);
    expect(container.textContent).not.toContain('Rx');
  });
});
