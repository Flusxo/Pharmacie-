/**
 * Automatic quality changes with hysteresis (pure, unit-tested in test/tierGovernor.test.ts).
 *
 * - Fed one frame-rate sample per second by the visible root canvas (never while the tab is hidden).
 * - Steps DOWN one tier only after the frame rate stayed under LOW_FPS for LOW_SECONDS in a row.
 * - Steps UP one tier only after it stayed above HIGH_FPS for HIGH_SECONDS in a row.
 * - At most one change per MIN_GAP_MS, and never below "medium" from frame rate alone except when the
 *   frame rate is truly unusable (under FLOOR_FPS for FLOOR_SECONDS): a single slow frame, a page load
 *   or a background tab never switches the 3D off.
 */
export type AutoTier = 'high' | 'medium' | 'low';

export const LOW_FPS = 24;
export const LOW_SECONDS = 6;
export const HIGH_FPS = 52;
export const HIGH_SECONDS = 90;
export const FLOOR_FPS = 18;
export const FLOOR_SECONDS = 10;
export const MIN_GAP_MS = 60_000;

const ORDER: AutoTier[] = ['high', 'medium', 'low'];

export class TierGovernor {
  tier: AutoTier;
  /** best tier the device may reach (the initial choice) */
  private readonly ceiling: AutoTier;
  private lowRun = 0;
  private floorRun = 0;
  private highRun = 0;
  private lastChange = -Infinity;

  /** `ceiling`: the best tier this device may climb to (default: where it started). */
  constructor(start: AutoTier, ceiling: AutoTier = start) {
    this.tier = start;
    this.ceiling = ceiling;
  }

  /** One sample per second of visible rendering; returns the (possibly new) tier. */
  sample(fps: number, now: number): AutoTier {
    if (!Number.isFinite(fps) || fps <= 0) return this.tier;
    this.lowRun = fps < LOW_FPS ? this.lowRun + 1 : 0;
    this.floorRun = fps < FLOOR_FPS ? this.floorRun + 1 : 0;
    this.highRun = fps > HIGH_FPS ? this.highRun + 1 : 0;
    if (now - this.lastChange < MIN_GAP_MS) return this.tier;
    const i = ORDER.indexOf(this.tier);
    const canDrop = this.tier === 'high' ? this.lowRun >= LOW_SECONDS : this.tier === 'medium' && this.floorRun >= FLOOR_SECONDS;
    if (canDrop) return this.change(ORDER[i + 1], now);
    if (this.highRun >= HIGH_SECONDS && i > ORDER.indexOf(this.ceiling)) return this.change(ORDER[i - 1], now);
    return this.tier;
  }

  /** A pause (hidden tab, off-screen) breaks the runs: time away never counts as slow or fast. */
  pause(): void {
    this.lowRun = 0;
    this.floorRun = 0;
    this.highRun = 0;
  }

  private change(to: AutoTier, now: number): AutoTier {
    this.tier = to;
    this.lastChange = now;
    this.lowRun = 0;
    this.floorRun = 0;
    this.highRun = 0;
    return to;
  }
}
