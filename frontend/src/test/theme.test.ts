import { describe, expect, it } from 'vitest';
import { isNight } from '../lib/settings';

describe('automatic theme by time of day', () => {
  const at = (h: number) => new Date(2026, 9, 25, h, 30);
  it('is dark from 19:00 to 07:00 and light in between', () => {
    expect([6, 7, 12, 18].map((h) => isNight(at(h)))).toEqual([true, false, false, false]);
    expect([19, 23, 0, 3].map((h) => isNight(at(h)))).toEqual([true, true, true, true]);
  });
});
