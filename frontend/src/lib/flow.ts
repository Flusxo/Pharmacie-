/**
 * The "How it works" walkthrough as data: for a scroll progress between 0 and 5 (one unit per step),
 * which objects travel along which link of the diagram, and the state of the countdown, the box being
 * prepared and the status tracker. The SVG diagram and the 3D scene both draw from this, so they agree.
 *
 * Links: P = patient, C = counter. (the platform), H = pharmacy. "PC" goes from P to C, "CP" back, etc.
 */
export type Link = 'PC' | 'CP' | 'CH' | 'HC' | 'HP';
export type Traveller = 'search' | 'results' | 'request' | 'answer' | 'payment' | 'delivery';

export interface FlowState {
  /** 0..4 */
  step: number;
  /** progress inside the step, 0..1 */
  local: number;
  objects: { kind: Traveller; link: Link; t: number }[];
  /** pharmacy answer window used, 0..1 (step 3) */
  countdown: number;
  /** box being prepared at the pharmacy, 0..1 */
  box: number;
  /** number of tracker statuses reached, 0..5 (Accepted, Preparing, Ready, Out for delivery, Delivered) */
  tracker: number;
  /** links drawn as "active" (animated arrows) */
  active: Link[];
}

export const STEPS = 5;
export const TRACKER = ['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as const;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Maps local progress in [a, b] to 0..1. */
const span = (x: number, a: number, b: number) => clamp((x - a) / (b - a));

export function flowState(progress: number): FlowState {
  const p = Math.min(STEPS - 1e-6, Math.max(0, progress));
  const step = Math.floor(p);
  const local = p - step;
  const s: FlowState = { step, local, objects: [], countdown: 0, box: 0, tracker: 0, active: [] };
  switch (step) {
    case 0: // search: the question goes to counter., the nearby pharmacies with stock come back
      if (local < 0.5) s.objects.push({ kind: 'search', link: 'PC', t: span(local, 0, 0.5) });
      else s.objects.push({ kind: 'results', link: 'CP', t: span(local, 0.5, 1) });
      s.active = local < 0.5 ? ['PC'] : ['CP'];
      break;
    case 1: // the patient chooses and sends: the request reaches ONLY the chosen pharmacy
      if (local < 0.5) s.objects.push({ kind: 'request', link: 'PC', t: span(local, 0, 0.5) });
      else s.objects.push({ kind: 'request', link: 'CH', t: span(local, 0.5, 1) });
      s.active = local < 0.5 ? ['PC'] : ['CH'];
      break;
    case 2: // the pharmacy answers within 30 minutes, the answer goes back to the patient
      s.countdown = span(local, 0, 0.55);
      if (local >= 0.55) {
        const t = span(local, 0.55, 1);
        s.objects.push(t < 0.5 ? { kind: 'answer', link: 'HC', t: t * 2 } : { kind: 'answer', link: 'CP', t: (t - 0.5) * 2 });
        s.active = t < 0.5 ? ['HC'] : ['CP'];
      }
      s.tracker = local >= 0.98 ? 1 : 0;
      break;
    case 3: // accepted: the patient pays (test mode), the pharmacy prepares the box
      s.objects.push({ kind: 'payment', link: 'PC', t: span(local, 0, 0.5) });
      if (local >= 0.5) s.objects.push({ kind: 'payment', link: 'CH', t: span(local, 0.5, 0.85) });
      s.box = span(local, 0.25, 0.9);
      s.active = local < 0.5 ? ['PC'] : ['CH'];
      s.tracker = local < 0.3 ? 1 : 2;
      break;
    default: // tracking: ready, out for delivery (simulated), delivered
      s.box = 1 - span(local, 0.15, 0.25);
      s.objects.push({ kind: 'delivery', link: 'HP', t: span(local, 0.2, 0.92) });
      s.active = ['HP'];
      s.tracker = local < 0.12 ? 3 : local < 0.92 ? 4 : 5;
      break;
  }
  return s;
}

/** Endpoints and control points of each link, in a 600 × 280 box (the 3D scene maps them to world units). */
export const NODES = { P: [96, 170], C: [300, 132], H: [504, 170] } as const;
export const CURVES: Record<
  'PC' | 'CH' | 'HP',
  { from: readonly [number, number]; ctrl: [number, number]; to: readonly [number, number] }
> = {
  PC: { from: NODES.P, ctrl: [190, 36], to: NODES.C },
  CH: { from: NODES.C, ctrl: [410, 36], to: NODES.H },
  HP: { from: NODES.H, ctrl: [300, 318], to: NODES.P },
};
/** A point of a link at t (reverse links run the base curve backwards). */
export function pointOn(link: Link, t: number): [number, number] {
  const base = link === 'CP' ? 'PC' : link === 'HC' ? 'CH' : link;
  const tt = link === 'CP' || link === 'HC' ? 1 - t : t;
  const { from, ctrl, to } = CURVES[base as 'PC' | 'CH' | 'HP'];
  const u = 1 - tt;
  return [u * u * from[0] + 2 * u * tt * ctrl[0] + tt * tt * to[0], u * u * from[1] + 2 * u * tt * ctrl[1] + tt * tt * to[1]];
}
