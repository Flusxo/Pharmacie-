import { describe, expect, it } from 'vitest';
import { FLOOR_SECONDS, HIGH_SECONDS, LOW_SECONDS, MIN_GAP_MS, TierGovernor } from '../lib/tierGovernor';

/** Feeds `n` one-second samples at `fps`, starting at time t (ms); returns the end time. */
function feed(g: TierGovernor, fps: number, n: number, t: number): number {
  for (let i = 0; i < n; i++) {
    t += 1000;
    g.sample(fps, t);
  }
  return t;
}

describe('quality tier governor (hysteresis)', () => {
  it('starts on medium and climbs to high on a strong device only after a long stable period', () => {
    const g = new TierGovernor('medium', 'high');
    let t = feed(g, 60, HIGH_SECONDS - 1, 0);
    expect(g.tier).toBe('medium');
    t = feed(g, 60, 1, t);
    expect(g.tier).toBe('high');
    expect(t).toBeGreaterThan(MIN_GAP_MS);
  });

  it('a device whose ceiling is medium never climbs, however smooth it runs', () => {
    const g = new TierGovernor('medium', 'medium');
    feed(g, 60, 1000, 0);
    expect(g.tier).toBe('medium');
  });

  it('ignores short dips: a single slow second or a few never lower the tier', () => {
    const g = new TierGovernor('high');
    let t = feed(g, 60, 10, 0);
    t = feed(g, 5, 1, t);
    t = feed(g, 60, 5, t);
    t = feed(g, 15, LOW_SECONDS - 1, t);
    feed(g, 60, 3, t);
    expect(g.tier).toBe('high');
  });

  it('drops one tier after a sustained low frame rate, then waits a minute before any other change', () => {
    const g = new TierGovernor('high');
    let t = feed(g, 18, LOW_SECONDS, 0);
    expect(g.tier).toBe('medium');
    // Even a terrible frame rate right after cannot change it again within a minute.
    t = feed(g, 5, 30, t);
    expect(g.tier).toBe('medium');
    expect(t).toBeLessThan(MIN_GAP_MS);
  });

  it('never switches 3D off for "slow but usable" (medium stays medium at 15–24 fps)', () => {
    const g = new TierGovernor('medium');
    feed(g, 18, 600, 0);
    expect(g.tier).toBe('medium');
  });

  it('goes to low only when truly unusable for a long time', () => {
    const g = new TierGovernor('medium');
    const t = feed(g, 8, FLOOR_SECONDS - 1, 0);
    expect(g.tier).toBe('medium');
    feed(g, 8, 1, t);
    expect(g.tier).toBe('low');
  });

  it('goes back up only after a long stable period, never above the starting tier', () => {
    const g = new TierGovernor('high');
    let t = feed(g, 18, LOW_SECONDS, 0);
    expect(g.tier).toBe('medium');
    t = feed(g, 60, HIGH_SECONDS - 1, t);
    expect(g.tier).toBe('medium');
    t = feed(g, 60, 1, t);
    expect(g.tier).toBe('high');
    feed(g, 60, HIGH_SECONDS * 3, t);
    expect(g.tier).toBe('high');
    const m = new TierGovernor('medium');
    feed(m, 60, HIGH_SECONDS * 3, 0);
    expect(m.tier).toBe('medium');
  });

  it('a pause (hidden tab) breaks a slow run, so time away never counts', () => {
    const g = new TierGovernor('high');
    const t = feed(g, 18, LOW_SECONDS - 1, 0);
    g.pause();
    feed(g, 18, LOW_SECONDS - 1, t);
    expect(g.tier).toBe('high');
  });

  it('ignores invalid samples', () => {
    const g = new TierGovernor('high');
    for (let i = 0; i < 100; i++) g.sample(Number.NaN, i * 1000);
    for (let i = 0; i < 100; i++) g.sample(0, i * 1000);
    expect(g.tier).toBe('high');
  });
});
