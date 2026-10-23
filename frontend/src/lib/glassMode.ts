/**
 * Frosted glass can be expensive over a live 3D canvas. Panels switch to a plain translucent tint (no blur) when the
 * device cannot afford it: the Low/Off tiers, or the render resolution had to drop because frames were late.
 * One flag on <html data-glass="flat"> drives the CSS (styles/glass.css); every reason is tracked separately so that one
 * cannot undo another.
 */
const reasons = new Set<string>();

export function setGlassFlat(reason: string, on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) reasons.add(reason);
  else reasons.delete(reason);
  if (reasons.size) document.documentElement.dataset.glass = 'flat';
  else delete document.documentElement.dataset.glass;
}
