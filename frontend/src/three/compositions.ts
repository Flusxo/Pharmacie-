/**
 * One composition per public page (add-on Part C). Positions are for a wide screen with the page text
 * on the left: the "hero" cluster sits on the right, deeper items at the sides further down so they
 * appear as the camera travels with the scroll. PageScene remaps them for portrait phones.
 */
import type { LabelSpec } from './textures';

export type ItemKind =
  | 'capsule'
  | 'tablet'
  | 'cross'
  | 'amber'
  | 'pillbottle'
  | 'blister'
  | 'box'
  | 'phone'
  | 'pin'
  | 'clipboard'
  | 'stethoscope'
  | 'envelope'
  | 'shelf'
  | 'blob'
  | 'bag'
  | 'pen'
  | 'tube'
  | 'inhaler'
  | 'counter'
  | 'scooter'
  | 'figure-pharmacist'
  | 'figure-doctor'
  | 'interior'
  | 'beams'
  | 'route';

export interface Item {
  kind: ItemKind;
  pos: [number, number, number];
  rot?: [number, number, number];
  scale?: number;
  colors?: [string, string];
  color?: string;
  blob?: 'sphere' | 'torus' | 'pill';
  label?: LabelSpec;
  brand?: string;
  /** turns (radians) added over the whole page scroll */
  spin?: number;
  /** vertical drift over the whole page scroll (world units) */
  drift?: number;
  /** capsule halves come apart while scrolling the first screen */
  split?: boolean;
  /** float speed (0 = still) */
  float?: number;
}

export interface Composition {
  items: Item[];
  /** camera travels by this much over the page scroll */
  travel: [number, number, number];
  /** where the hero cluster is centred (used to recentre it on phones) */
  heroX: number;
}

export type CompositionName =
  | 'home'
  | 'how'
  | 'patients'
  | 'pharmacies'
  | 'doctors'
  | 'about'
  | 'contact'
  | 'faq'
  | 'legal'
  | 'auth'
  // After login: calmer, at the sides of the content, each page with its own objects.
  | 'app-home'
  | 'app-search'
  | 'app-details'
  | 'app-map'
  | 'app-requests'
  | 'app-tracking'
  | 'app-account'
  | 'app-pharmacy'
  | 'app-doctor'
  | 'app-admin';

const TEAL: [string, string] = ['#0d9488', '#F8FAFC'];
const GREEN: [string, string] = ['#10B981', '#ECFDF5'];
const SKY: [string, string] = ['#0ea5e9', '#F8FAFC'];
const AMBER: [string, string] = ['#F59E0B', '#FEF3C7'];
const ROSE: [string, string] = ['#E11D48', '#FFF1F2'];
const VIOLET: [string, string] = ['#7C3AED', '#F5F3FF'];

const APAISA: LabelSpec = { name: 'Apaisa', dosage: '150 ml', color: '#065F46', light: '#A7F3D0', cip: '3400930001234' };
const CALMORA: LabelSpec = { name: 'Calmora', dosage: '500 mg', color: '#0F766E', light: '#99F6E4', cip: '3400930005678' };
const VITALIS: LabelSpec = { name: 'Vitalis', dosage: '1000 UI', color: '#C2410C', light: '#FED7AA', cip: '3400930009012' };

/** Items further down the page, at the sides, so scrolling always reveals something. */
function depth(seed: number, colors: [string, string][]): Item[] {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: 9 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const pick = r();
    return {
      kind: pick < 0.55 ? 'capsule' : pick < 0.8 ? 'tablet' : 'blob',
      pos: [side * (4.1 + r() * 1.2), -3.2 - i * 1.6 - r(), -1.2 - r() * 2.5],
      rot: [r() * 3, r() * 3, r() * 3],
      scale: 1.6 + r() * 1.2,
      colors: colors[i % colors.length],
      color: '#a7f3d0',
      blob: 'pill',
      spin: (r() - 0.5) * 6,
      drift: 1 + r() * 1.5,
      float: 0.8 + r(),
    } satisfies Item;
  });
}

/** Calm side objects for the app pages: outside the content column, smaller, slow. */
function calm(seed: number, colors: [string, string][], extra: Item[] = []): Composition {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const items: Item[] = Array.from({ length: 10 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const pick = r();
    return {
      kind: pick < 0.6 ? 'capsule' : 'tablet',
      pos: [side * (4.7 + r() * 0.9), 2.2 - i * 1.5 - r(), -1.5 - r() * 2],
      rot: [r() * 3, r() * 3, r() * 3],
      scale: 1.5 + r() * 0.9,
      colors: colors[i % colors.length],
      spin: (r() - 0.5) * 4,
      drift: 0.6 + r(),
      float: 0.5 + r() * 0.6,
    } satisfies Item;
  });
  return { heroX: 0, travel: [0, -8, 0], items: [...extra, ...items] };
}

export const COMPOSITIONS: Record<CompositionName, Composition> = {
  // Patient home: the big hero is drawn here (no second canvas) — bottle, capsules and tablets on the
  // right, the pharmacy interior behind; scrolling travels down past the side objects.
  'app-home': {
    heroX: 2.9,
    travel: [0, -8, 0],
    items: [
      { kind: 'amber', pos: [2.9, -0.3, 0], rot: [0.05, -0.12, 0.06], scale: 1.55, label: APAISA, spin: 1.2, float: 0.6 },
      { kind: 'capsule', pos: [1.6, 1.3, 0.9], rot: [0.4, 0.2, 0.9], scale: 3.0, colors: TEAL, split: true, spin: 2, float: 1.2 },
      { kind: 'capsule', pos: [4.4, 1.5, -0.4], rot: [0.2, 0.5, -0.7], scale: 2.6, colors: GREEN, split: true, spin: -1.5, float: 1 },
      { kind: 'tablet', pos: [1.8, -1.5, 1.1], rot: [1.1, 0.3, 0], scale: 2.3, spin: 3, float: 1.1 },
      { kind: 'tablet', pos: [4.5, -1.2, 0.7], rot: [0.6, 1.2, 0.2], scale: 2.0, spin: -2, float: 0.9 },
      { kind: 'interior', pos: [1.5, -3.4, -8], rot: [0, -0.12, 0] },
      ...calm(201, [TEAL, GREEN, SKY]).items.filter((it) => it.pos[1] < -2),
    ],
  },
  'app-search': calm(211, [SKY, TEAL, AMBER], [{ kind: 'pin', pos: [-5.2, 1.6, -1.8], scale: 0.7, float: 0.8 }]),
  'app-details': calm(
    223,
    [TEAL, VIOLET, GREEN],
    [{ kind: 'blister', pos: [5.2, 1.4, -2.2], rot: [0.3, -0.5, 0.3], scale: 0.8, label: CALMORA, float: 0.7 }],
  ),
  'app-map': calm(
    227,
    [GREEN, TEAL],
    [
      { kind: 'pin', pos: [5.2, 1.8, -2], scale: 0.8, float: 0.8 },
      { kind: 'pin', pos: [-5.1, -1, -2.4], scale: 0.6, color: '#94a3b8', float: 1 },
    ],
  ),
  'app-requests': calm(229, [AMBER, TEAL, SKY], [{ kind: 'bag', pos: [5.1, 1.6, -2], rot: [0, -0.5, 0], scale: 0.7, float: 0.7 }]),
  'app-tracking': calm(
    233,
    [AMBER, GREEN],
    [
      { kind: 'bag', pos: [-5.2, 1.6, -2], rot: [0, 0.5, 0], scale: 0.7, float: 0.7 },
      { kind: 'route', pos: [0, -3.2, -6], rot: [0.25, 0, 0], scale: 1.1 },
    ],
  ),
  'app-account': calm(239, [TEAL, ROSE]),
  'app-pharmacy': calm(
    241,
    [AMBER, TEAL, VIOLET],
    [{ kind: 'box', pos: [5.2, 1.5, -2.2], rot: [0.2, -0.5, 0.1], scale: 0.8, brand: 'Calmora', color: '#065F46', float: 0.7 }],
  ),
  'app-doctor': calm(251, [TEAL, SKY], [{ kind: 'stethoscope', pos: [5.1, 1.5, -2], rot: [0.3, -0.5, 0.4], scale: 0.9, float: 0.7 }]),
  'app-admin': calm(257, [TEAL, GREEN], [{ kind: 'blob', pos: [5.1, 1.7, -2.4], scale: 0.9, color: '#a7f3d0', blob: 'torus', float: 0.6 }]),
  home: {
    heroX: 2.9,
    travel: [0, -9, 0],
    items: [
      { kind: 'amber', pos: [2.7, -0.2, 0], rot: [0.05, -0.12, 0.06], scale: 1.65, label: APAISA, spin: 1.2, float: 0.6 },
      { kind: 'capsule', pos: [1.25, 1.35, 0.9], rot: [0.4, 0.2, 0.9], scale: 3.2, colors: TEAL, split: true, spin: 2, float: 1.2 },
      { kind: 'capsule', pos: [4.3, 1.55, -0.4], rot: [0.2, 0.5, -0.7], scale: 2.8, colors: GREEN, split: true, spin: -1.5, float: 1 },
      { kind: 'capsule', pos: [3.9, -1.5, 1.0], rot: [1.2, 0.2, 0.3], scale: 2.6, colors: SKY, spin: 2.5, float: 1.4 },
      { kind: 'tablet', pos: [1.5, -1.3, 1.1], rot: [1.1, 0.3, 0], scale: 2.4, spin: 3, float: 1.1 },
      { kind: 'tablet', pos: [4.6, -0.2, 0.7], rot: [0.6, 1.2, 0.2], scale: 2.1, spin: -2, float: 0.9 },
      { kind: 'cross', pos: [4.7, 2.3, -1.6], rot: [0.1, -0.5, 0], scale: 0.55, float: 0.7 },
      { kind: 'interior', pos: [1.5, -3.4, -8], rot: [0, -0.12, 0] },
      { kind: 'beams', pos: [1.5, -3.4, -6.5] },
      ...depth(11, [TEAL, GREEN, SKY, AMBER]),
    ],
  },
  how: {
    heroX: 3,
    travel: [0, -10, 0],
    items: [
      { kind: 'capsule', pos: [4.5, 1.8, -1.2], rot: [0.4, 0.2, 0.9], scale: 2.4, colors: TEAL, float: 1 },
      { kind: 'tablet', pos: [-4.6, 1.5, -1.6], rot: [1.1, 0.3, 0], scale: 2.2, float: 1 },
      { kind: 'cross', pos: [4.8, -1.4, -2], scale: 0.4, float: 0.6 },
      ...depth(23, [TEAL, GREEN, AMBER]),
    ],
  },
  patients: {
    heroX: 2.9,
    travel: [0, -9, 0],
    items: [
      { kind: 'phone', pos: [2.8, 0.1, 0], rot: [0.12, -0.45, 0.08], scale: 1.75, spin: 0.8, float: 0.6 },
      { kind: 'pin', pos: [1.35, 1.5, 0.8], rot: [0, 0.4, 0.1], scale: 1.0, drift: 1.2, float: 1.2 },
      { kind: 'pin', pos: [4.4, 1.3, -0.3], rot: [0, -0.3, -0.1], scale: 0.9, float: 1 },
      { kind: 'pin', pos: [4.1, -1.4, 0.7], scale: 0.75, color: '#94a3b8', float: 1.3 },
      { kind: 'capsule', pos: [1.4, -1.4, 1], rot: [1.2, 0.2, 0.3], scale: 2.6, colors: GREEN, split: true, spin: 2, float: 1.2 },
      ...depth(37, [GREEN, SKY, TEAL]),
    ],
  },
  pharmacies: {
    heroX: 2.9,
    travel: [0, -9, 0],
    items: [
      { kind: 'shelf', pos: [2.9, -0.1, -0.6], rot: [0.04, -0.32, 0], scale: 1.05, spin: 0.3, float: 0.3 },
      { kind: 'interior', pos: [0, -3.4, -9], rot: [0, 0.1, 0] },
      { kind: 'cross', pos: [3.9, 1.85, -1.0], rot: [0, -0.3, 0], scale: 0.45, float: 0.7 },
      { kind: 'box', pos: [1.2, -1.3, 1.0], rot: [0.2, 0.5, 0.1], scale: 1.1, brand: 'Calmora', color: '#065F46', spin: 2, float: 1.1 },
      { kind: 'capsule', pos: [1.25, 1.45, 0.9], rot: [0.4, 0.2, 0.9], scale: 2.8, colors: AMBER, split: true, spin: 2, float: 1.2 },
      ...depth(53, [AMBER, TEAL, VIOLET]),
    ],
  },
  doctors: {
    heroX: 2.9,
    travel: [0, -9, 0],
    items: [
      { kind: 'clipboard', pos: [2.6, 0.15, 0], rot: [0.08, -0.4, -0.06], scale: 1.6, spin: 0.6, float: 0.6 },
      { kind: 'stethoscope', pos: [4.1, -0.7, 0.7], rot: [0.3, -0.5, 0.4], scale: 1.4, spin: 1.2, float: 0.9 },
      { kind: 'capsule', pos: [1.3, 1.4, 0.9], rot: [0.4, 0.2, 0.9], scale: 3, colors: TEAL, split: true, spin: 2, float: 1.2 },
      { kind: 'pen', pos: [4.4, 1.6, -0.4], rot: [0.2, 0.3, -0.9], scale: 1.2, float: 1 },
      ...depth(71, [TEAL, ROSE, SKY]),
    ],
  },
  about: {
    heroX: 3,
    travel: [0, -9, 0],
    items: [
      { kind: 'blob', pos: [2.5, 0.7, -0.5], scale: 1.9, color: '#5eead4', blob: 'sphere', drift: 1.5, float: 0.5 },
      { kind: 'blob', pos: [4.2, -0.6, 0.3], rot: [0.9, 0.3, 0], scale: 1.5, color: '#a7f3d0', blob: 'torus', spin: 2, float: 0.8 },
      { kind: 'blob', pos: [1.4, -1.3, 0.7], rot: [0.3, 0, 0.8], scale: 1.3, color: '#99f6e4', blob: 'pill', spin: -1.5, float: 1 },
      { kind: 'blob', pos: [4.6, 1.9, -1.3], scale: 0.9, color: '#ffffff', blob: 'sphere', float: 0.7 },
      { kind: 'cross', pos: [1.2, 1.5, 0.3], scale: 0.32, float: 0.8 },
      ...depth(89, [TEAL, GREEN]),
    ],
  },
  contact: {
    heroX: 2.9,
    travel: [0, -6, 0],
    items: [
      { kind: 'envelope', pos: [2.8, 0.2, 0], rot: [0.1, -0.45, 0.08], scale: 1.55, spin: 0.8, float: 0.8 },
      { kind: 'cross', pos: [4.3, 1.55, -0.6], rot: [0.1, -0.4, 0], scale: 0.6, float: 0.7 },
      { kind: 'capsule', pos: [1.4, -1.3, 1], rot: [1.2, 0.2, 0.3], scale: 2.6, colors: TEAL, split: true, spin: 2, float: 1.2 },
      { kind: 'tablet', pos: [4.4, -1.2, 0.8], rot: [0.6, 1.2, 0.2], scale: 2, float: 1 },
      ...depth(97, [TEAL, GREEN]),
    ],
  },
  faq: {
    heroX: 3,
    travel: [0, -9, 0],
    items: [
      { kind: 'blob', pos: [3.4, 0.5, -0.8], scale: 1.6, color: '#a7f3d0', blob: 'pill', rot: [0.3, 0, 0.9], spin: 2, float: 0.6 },
      { kind: 'capsule', pos: [2.0, -1.1, 0.8], rot: [1.2, 0.2, 0.3], scale: 2.6, colors: SKY, split: true, spin: 2, float: 1.2 },
      { kind: 'cross', pos: [4.4, 1.7, -1.2], scale: 0.45, float: 0.7 },
      ...depth(103, [SKY, TEAL]),
    ],
  },
  legal: {
    heroX: 3,
    travel: [0, -9, 0],
    items: [
      { kind: 'blob', pos: [3.6, 0.6, -1], scale: 1.4, color: '#99f6e4', blob: 'sphere', float: 0.5 },
      { kind: 'blob', pos: [2.3, -1, 0.2], rot: [0.9, 0.3, 0], scale: 1.1, color: '#ffffff', blob: 'torus', spin: 1.5, float: 0.7 },
      ...depth(127, [TEAL, GREEN]),
    ],
  },
  auth: {
    heroX: -2.9,
    travel: [0, -3, 0],
    // Below the login heading (the text block stays clear), plus a few items on the far right.
    items: [
      { kind: 'amber', pos: [-3.0, -2.05, 0], rot: [0.05, 0.15, -0.05], scale: 1.55, label: APAISA, float: 0.6 },
      { kind: 'pillbottle', pos: [-4.7, -1.75, -0.9], rot: [0.05, 0.3, 0.08], scale: 1.25, label: VITALIS, float: 0.7 },
      { kind: 'blister', pos: [-1.2, -1.75, 0.3], rot: [0.3, 0.5, -0.4], scale: 1.0, label: CALMORA, float: 0.9 },
      { kind: 'capsule', pos: [-1.2, -2.35, 1.0], rot: [1.2, 0.2, 0.3], scale: 2.8, colors: TEAL, split: true, float: 1.2 },
      { kind: 'capsule', pos: [-4.6, -2.45, 0.8], rot: [0.4, 0.2, 0.9], scale: 2.4, colors: GREEN, split: true, float: 1 },
      { kind: 'tablet', pos: [-2.3, -2.7, 1.2], rot: [1.1, 0.3, 0], scale: 2.1, float: 1.1 },
      { kind: 'tablet', pos: [-0.4, -2.4, 1.4], rot: [0.6, 1.2, 0.2], scale: 1.8, float: 0.9 },
      { kind: 'cross', pos: [4.9, 2.1, -2.2], rot: [0.1, -0.5, 0], scale: 0.5, float: 0.7 },
      { kind: 'capsule', pos: [4.8, 0.6, -2.5], rot: [0.4, 0.2, 0.9], scale: 2.2, colors: SKY, float: 1 },
      { kind: 'tablet', pos: [4.6, -2.2, -2], rot: [1.1, 0.3, 0], scale: 2, float: 1 },
      { kind: 'beams', pos: [0, -3.6, -7] },
    ],
  },
};

/** Which composition a route shows (public site and app). */
export function compositionFor(path: string): CompositionName {
  // Whole path segments: "/doctors" (public page) is not "/doctor" (dashboard).
  const at = (p: string) => path === p || path.startsWith(p + '/');
  if (path === '/') return 'home';
  if (at('/home')) return 'app-home';
  if (at('/search')) return 'app-search';
  if (at('/medicines')) return 'app-details';
  if (at('/map')) return 'app-map';
  if (at('/requests')) return 'app-requests';
  if (at('/orders') || at('/track')) return 'app-tracking';
  if (at('/profile') || at('/waiting')) return 'app-account';
  if (at('/pharmacy')) return 'app-pharmacy';
  if (at('/doctor')) return 'app-doctor';
  if (at('/admin')) return 'app-admin';
  if (at('/how-it-works')) return 'how';
  if (at('/patients')) return 'patients';
  if (at('/pharmacies')) return 'pharmacies';
  if (at('/doctors')) return 'doctors';
  if (at('/about')) return 'about';
  if (at('/contact')) return 'contact';
  if (at('/faq')) return 'faq';
  if (at('/privacy') || at('/terms')) return 'legal';
  return 'auth';
}
