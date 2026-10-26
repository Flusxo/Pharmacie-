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
  | 'route'
  /** many decorative capsules and tablets drawn with instancing (see PageScene FieldView) */
  | 'field'
  /** any medicine pack by its form (used by the rendered medicine pictures) */
  | 'product';

export interface FieldInstance {
  kind: 'capsule' | 'tablet';
  pos: [number, number, number];
  rot: [number, number, number];
  scale: number;
  colors: [string, string];
  spin: number;
  drift: number;
  float: number;
}

export interface Item {
  kind: ItemKind;
  pos: [number, number, number];
  rot?: [number, number, number];
  scale?: number;
  colors?: [string, string];
  color?: string;
  blob?: 'sphere' | 'torus' | 'pill';
  label?: LabelSpec;
  /** medicine form for kind 'product' */
  form?: string;
  /** cap unscrewed (0 closed .. 1 off) for kind 'product' */
  open?: number;
  brand?: string;
  /** turns (radians) added over the whole page scroll */
  spin?: number;
  /** vertical drift over the whole page scroll (world units) */
  drift?: number;
  /** capsule halves come apart while scrolling the first screen */
  split?: boolean;
  /** float speed (0 = still) */
  float?: number;
  /** kind 'field': the instances */
  field?: FieldInstance[];
  /** tied to step N of a scroll story: flies in when that step is read, out when another is (see story.ts) */
  story?: number;
  /** placed by screen position: pos = [x as a fraction of the half width (-1..1), y in px from the top of the screen, z] */
  screen?: boolean;
}

export interface Composition {
  items: Item[];
  /** the soft full-background light (0..1): the old cone shapes are gone */
  light?: number;
  /** camera travels by this much over the page scroll */
  travel: [number, number, number];
  /** where the hero cluster is centred (used to recentre it on phones) */
  heroX: number;
  /** portrait screens: these objects replace the items (placed by screen position, see Item.screen) */
  portrait?: Item[];
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
  | 'privacy'
  | 'terms'
  | 'auth'
  | 'register'
  | 'recover'
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
  const field: FieldInstance[] = Array.from({ length: 9 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const pick = r();
    return {
      kind: pick < 0.7 ? 'capsule' : 'tablet',
      pos: [side * (4.1 + r() * 1.2), -3.2 - i * 1.6 - r(), -1.2 - r() * 2.5],
      rot: [r() * 3, r() * 3, r() * 3],
      scale: 1.6 + r() * 1.2,
      colors: colors[i % colors.length],
      spin: (r() - 0.5) * 6,
      drift: 1 + r() * 1.5,
      float: 0.8 + r(),
    } satisfies FieldInstance;
  });
  return [{ kind: 'field', pos: [0, 0, 0], field }];
}

/** Calm side objects for the app pages: outside the content column, smaller, slow. */
function calm(seed: number, colors: [string, string][], extra: Item[] = [], belowOnly = false): Composition {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const all: FieldInstance[] = Array.from({ length: 10 }, (_, i) => {
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
    } satisfies FieldInstance;
  });
  const field = belowOnly ? all.filter((f) => f.pos[1] < -2) : all;
  return { heroX: 0, travel: [0, -8, 0], items: [...extra, { kind: 'field', pos: [0, 0, 0], field }] };
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
      ...calm(201, [TEAL, GREEN, SKY], [], true).items,
    ],
  },
  'app-search': calm(
    211,
    [SKY, TEAL, AMBER],
    [
      { kind: 'shelf', pos: [-5.6, 1.1, -3.4], rot: [0.05, 0.4, 0], scale: 0.7, float: 0.3 },
      { kind: 'pin', pos: [5.2, 1.6, -1.8], scale: 0.7, float: 0.8 },
      { kind: 'blob', pos: [5.0, -1.2, -2.4], rot: [0.9, 0.3, 0], scale: 0.8, color: '#99f6e4', blob: 'torus', spin: 2, float: 0.8 },
    ],
  ),
  'app-details': calm(
    223,
    [TEAL, VIOLET, GREEN],
    [
      { kind: 'blister', pos: [5.2, 1.4, -2.2], rot: [0.3, -0.5, 0.3], scale: 0.8, label: CALMORA, float: 0.7 },
      { kind: 'amber', pos: [-5.3, 1.2, -2.6], rot: [0.05, 0.5, 0.05], scale: 0.8, label: APAISA, spin: 1, float: 0.6 },
      { kind: 'box', pos: [5.0, -1.4, -2.0], rot: [0.2, -0.6, 0.1], scale: 0.7, brand: 'Vitalis', color: '#C2410C', float: 0.8 },
    ],
  ),
  'app-map': calm(
    227,
    [GREEN, TEAL],
    [
      { kind: 'phone', pos: [5.4, 1.2, -2.4], rot: [0.12, -0.5, 0.08], scale: 0.9, float: 0.6 },
      { kind: 'pin', pos: [-5.2, 1.8, -2], scale: 0.8, float: 0.8 },
      { kind: 'pin', pos: [-5.1, -1, -2.4], scale: 0.6, color: '#94a3b8', float: 1 },
      { kind: 'pin', pos: [5.0, -1.6, -2.2], scale: 0.65, color: '#0d9488', float: 0.9 },
    ],
  ),
  'app-requests': calm(
    229,
    [AMBER, TEAL, SKY],
    [
      { kind: 'clipboard', pos: [5.2, 1.5, -2.2], rot: [0.1, -0.5, 0.06], scale: 0.8, float: 0.7 },
      { kind: 'bag', pos: [-5.1, 1.6, -2], rot: [0, 0.5, 0], scale: 0.7, float: 0.7 },
      { kind: 'envelope', pos: [5.1, -1.4, -2.2], rot: [0.1, -0.4, 0.1], scale: 0.7, float: 0.9 },
    ],
  ),
  'app-tracking': calm(
    233,
    [AMBER, GREEN],
    [
      { kind: 'bag', pos: [-5.2, 1.6, -2], rot: [0, 0.5, 0], scale: 0.7, float: 0.7 },
      { kind: 'phone', pos: [5.3, 1.3, -2.4], rot: [0.12, -0.5, 0.08], scale: 0.85, float: 0.6 },
      { kind: 'route', pos: [0, -3.2, -6], rot: [0.25, 0, 0], scale: 1.1 },
    ],
  ),
  'app-account': calm(
    239,
    [TEAL, ROSE],
    [
      { kind: 'figure-pharmacist', pos: [5.4, 0.2, -3.4], rot: [0, -0.4, 0], scale: 0.62, float: 0.3 },
      { kind: 'cross', pos: [-5.2, 1.6, -2.4], rot: [0.1, 0.4, 0], scale: 0.45, float: 0.7 },
      { kind: 'pillbottle', pos: [-5.0, -1.4, -2.2], rot: [0.05, 0.3, 0.08], scale: 0.8, label: VITALIS, float: 0.8 },
    ],
  ),
  'app-pharmacy': calm(
    241,
    [AMBER, TEAL, VIOLET],
    [
      { kind: 'shelf', pos: [-5.7, 0.9, -3.6], rot: [0.05, 0.4, 0], scale: 0.75, float: 0.3 },
      { kind: 'box', pos: [5.2, 1.5, -2.2], rot: [0.2, -0.5, 0.1], scale: 0.8, brand: 'Calmora', color: '#065F46', float: 0.7 },
      { kind: 'box', pos: [5.4, -0.6, -2.6], rot: [0.1, 0.4, -0.1], scale: 0.65, brand: 'Apaisa', color: '#0369A1', float: 0.9 },
      { kind: 'cross', pos: [-5.2, 2.4, -2.6], rot: [0, 0.4, 0], scale: 0.4, float: 0.7 },
    ],
  ),
  'app-doctor': calm(
    251,
    [TEAL, SKY],
    [
      { kind: 'figure-doctor', pos: [5.4, 0.2, -3.4], rot: [0, -0.4, 0], scale: 0.62, float: 0.3 },
      { kind: 'stethoscope', pos: [-5.1, 1.5, -2], rot: [0.3, 0.5, 0.4], scale: 0.9, float: 0.7 },
      { kind: 'clipboard', pos: [-5.2, -1.2, -2.4], rot: [0.1, 0.5, -0.06], scale: 0.7, float: 0.8 },
    ],
  ),
  'app-admin': calm(
    257,
    [TEAL, GREEN],
    [
      { kind: 'blob', pos: [5.1, 1.7, -2.4], scale: 0.9, color: '#a7f3d0', blob: 'torus', float: 0.6 },
      { kind: 'clipboard', pos: [-5.2, 1.4, -2.4], rot: [0.1, 0.5, -0.06], scale: 0.8, float: 0.7 },
      { kind: 'shelf', pos: [5.5, -1.6, -3.4], rot: [0.05, -0.4, 0], scale: 0.6, float: 0.3 },
      { kind: 'blob', pos: [-5.0, -1.3, -2.2], scale: 0.7, color: '#99f6e4', blob: 'sphere', float: 0.9 },
    ],
  ),
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
  privacy: {
    heroX: 3,
    travel: [0, -9, 0],
    items: [
      { kind: 'cross', pos: [3.2, 0.5, -0.6], rot: [0.1, -0.4, 0], scale: 0.75, spin: 0.8, float: 0.6 },
      { kind: 'clipboard', pos: [4.6, -0.9, 0.2], rot: [0.1, -0.5, 0.06], scale: 1.2, float: 0.8 },
      { kind: 'blob', pos: [2.1, -1.1, 0.4], rot: [0.9, 0.3, 0], scale: 1.1, color: '#ffffff', blob: 'torus', spin: 1.5, float: 0.7 },
      ...depth(127, [TEAL, GREEN]),
    ],
  },
  terms: {
    heroX: 3,
    travel: [0, -9, 0],
    items: [
      { kind: 'clipboard', pos: [3.0, 0.4, -0.4], rot: [0.08, -0.4, -0.06], scale: 1.5, spin: 0.6, float: 0.6 },
      { kind: 'envelope', pos: [4.7, -0.9, 0.3], rot: [0.1, -0.4, 0.1], scale: 1.0, float: 0.8 },
      { kind: 'blob', pos: [1.9, -1.2, 0.5], rot: [0.3, 0, 0.8], scale: 1.0, color: '#99f6e4', blob: 'pill', spin: -1.5, float: 1 },
      ...depth(131, [TEAL, SKY]),
    ],
  },
  // Login, sign-up and recovery: the text (headline, lead, points) fills the left column from the top and only the form is
  // glass. So the objects sit in the free band under the text at the lower left, and in the right margin beside the form
  // (never behind either). On portrait screens they sit in the gap above the headline (see `portrait`).
  auth: {
    heroX: -2.9,
    travel: [0, -3, 0],
    items: [
      { kind: 'amber', pos: [-3.3, -2.55, 0], rot: [0.05, 0.15, -0.05], scale: 0.78, label: APAISA, float: 0.6 },
      { kind: 'pillbottle', pos: [-4.5, -2.45, -0.4], rot: [0.05, 0.3, 0.08], scale: 0.62, label: VITALIS, float: 0.7 },
      { kind: 'blister', pos: [-1.7, -2.3, 0.3], rot: [0.3, 0.5, -0.4], scale: 0.6, label: CALMORA, float: 0.9 },
      { kind: 'capsule', pos: [-2.3, -3.1, 1.0], rot: [1.2, 0.2, 0.3], scale: 1.5, colors: TEAL, split: true, float: 1.2 },
      { kind: 'tablet', pos: [-0.7, -2.95, 1.2], rot: [0.6, 1.2, 0.2], scale: 1.3, float: 0.9 },
      { kind: 'cross', pos: [5.4, 2.0, -2.2], rot: [0.1, -0.5, 0], scale: 0.45, float: 0.7 },
      { kind: 'capsule', pos: [5.3, 0.4, -2.5], rot: [0.4, 0.2, 0.9], scale: 1.5, colors: SKY, float: 1 },
      { kind: 'tablet', pos: [5.2, -2.0, -2], rot: [1.1, 0.3, 0], scale: 1.4, float: 1 },
    ],
    portrait: [
      { kind: 'amber', screen: true, pos: [-0.12, 248, 0], rot: [0.05, 0.15, -0.05], scale: 0.5, label: APAISA, float: 0.6 },
      { kind: 'blister', screen: true, pos: [0.42, 215, 0], rot: [0.3, 0.5, -0.4], scale: 0.4, label: CALMORA, float: 0.9 },
      { kind: 'capsule', screen: true, pos: [-0.55, 215, 0.4], rot: [1.2, 0.2, 0.3], scale: 1.0, colors: TEAL, split: true, float: 1.2 },
      { kind: 'tablet', screen: true, pos: [0.1, 262, 0.6], rot: [0.6, 1.2, 0.2], scale: 0.9, float: 0.9 },
    ],
  },
  register: {
    heroX: -2.9,
    travel: [0, -3, 0],
    items: [
      { kind: 'clipboard', pos: [-3.4, -2.75, 0], rot: [0.1, 0.4, -0.06], scale: 0.7, float: 0.6 },
      { kind: 'figure-pharmacist', pos: [-4.7, -2.9, -0.8], rot: [0, 0.4, 0], scale: 0.55, float: 0.3 },
      { kind: 'phone', pos: [-1.8, -2.45, 0.3], rot: [0.12, 0.45, 0.08], scale: 0.6, float: 0.7 },
      { kind: 'capsule', pos: [-2.6, -3.1, 1.1], rot: [1.2, 0.2, 0.3], scale: 1.4, colors: GREEN, split: true, float: 1.2 },
      { kind: 'tablet', pos: [-0.8, -2.95, 1.0], rot: [0.6, 1.2, 0.2], scale: 1.2, float: 0.9 },
      { kind: 'cross', pos: [5.4, 2.0, -2.2], rot: [0.1, -0.5, 0], scale: 0.45, float: 0.7 },
      { kind: 'capsule', pos: [5.3, 0.2, -2.5], rot: [0.4, 0.2, 0.9], scale: 1.5, colors: AMBER, float: 1 },
    ],
    portrait: [
      { kind: 'clipboard', screen: true, pos: [-0.2, 250, 0], rot: [0.1, 0.4, -0.06], scale: 0.42, float: 0.6 },
      { kind: 'phone', screen: true, pos: [0.4, 248, 0.3], rot: [0.12, 0.45, 0.08], scale: 0.4, float: 0.7 },
      { kind: 'capsule', screen: true, pos: [-0.6, 215, 0.4], rot: [1.2, 0.2, 0.3], scale: 1.0, colors: GREEN, split: true, float: 1.2 },
      { kind: 'tablet', screen: true, pos: [0.08, 262, 0.6], rot: [0.6, 1.2, 0.2], scale: 0.9, float: 0.9 },
    ],
  },
  recover: {
    heroX: -2.9,
    travel: [0, -3, 0],
    items: [
      { kind: 'envelope', pos: [-3.2, -2.5, 0], rot: [0.1, 0.45, 0.08], scale: 0.8, float: 0.8 },
      { kind: 'cross', pos: [-1.6, -2.5, 0.4], rot: [0.1, 0.4, 0], scale: 0.4, float: 0.7 },
      { kind: 'capsule', pos: [-4.4, -3.0, 0.9], rot: [0.4, 0.2, 0.9], scale: 1.5, colors: SKY, split: true, float: 1 },
      { kind: 'tablet', pos: [-2.4, -3.1, 1.2], rot: [1.1, 0.3, 0], scale: 1.3, float: 1.1 },
      { kind: 'blob', pos: [5.3, 1.0, -2.4], scale: 0.8, color: '#a7f3d0', blob: 'pill', rot: [0.3, 0, 0.9], spin: 2, float: 0.8 },
    ],
    portrait: [
      { kind: 'envelope', screen: true, pos: [-0.1, 250, 0], rot: [0.1, 0.45, 0.08], scale: 0.6, float: 0.8 },
      { kind: 'capsule', screen: true, pos: [-0.6, 215, 0.4], rot: [0.4, 0.2, 0.9], scale: 1.0, colors: SKY, split: true, float: 1 },
      { kind: 'tablet', screen: true, pos: [0.5, 255, 0.6], rot: [1.1, 0.3, 0], scale: 0.9, float: 1.1 },
    ],
  },
};

// ---- Scroll stories: one group of objects per step of an explanation, on the right of the text. ----
const at = (story: number, it: Omit<Item, 'story' | 'pos'> & { pos?: [number, number, number] }): Item => ({
  pos: [3.0, 0.2, 0],
  ...it,
  story,
});
const VIOLETC: [string, string] = ['#7C3AED', '#F5F3FF'];
const SCOOTER: Item = { kind: 'scooter', pos: [2.9, -0.5, 0.3], rot: [0.1, -0.7, 0], scale: 2.3, float: 0.4 };
const STORIES: Partial<Record<CompositionName, Item[]>> = {
  home: [
    at(0, { kind: 'shelf', pos: [3.3, 0.3, -0.9], rot: [0.04, -0.32, 0], scale: 0.9 }),
    at(0, { kind: 'amber', pos: [1.9, -0.8, 0.9], rot: [0.05, -0.1, 0.05], scale: 1.05, label: APAISA, float: 0.5 }),
    at(0, { kind: 'box', pos: [4.5, -0.7, 0.6], rot: [0.2, -0.5, 0.1], scale: 1.0, brand: 'Calmora', color: '#065F46', float: 0.8 }),
    at(1, { kind: 'capsule', pos: [2.2, 0.9, 0.5], rot: [0.4, 0.2, 0.9], scale: 2.9, colors: TEAL, split: true, float: 1 }),
    at(1, { kind: 'capsule', pos: [3.8, 1.0, 0.2], rot: [0.2, 0.5, -0.7], scale: 2.5, colors: AMBER, float: 1.1 }),
    at(1, { kind: 'capsule', pos: [3.0, -0.4, 1.0], rot: [1.2, 0.2, 0.3], scale: 2.6, colors: ROSE, float: 0.9 }),
    at(1, { kind: 'capsule', pos: [4.5, -0.6, 0.3], rot: [0.6, 0.3, 0.2], scale: 2.2, colors: SKY, float: 1.2 }),
    at(1, { kind: 'capsule', pos: [2.9, 1.7, -0.4], rot: [0.3, 0.1, 0.5], scale: 2.1, colors: VIOLETC, float: 1 }),
    at(1, { kind: 'tablet', pos: [1.8, -0.8, 0.8], rot: [1.1, 0.3, 0], scale: 2.1, float: 1 }),
    at(1, { kind: 'tablet', pos: [3.7, -1.3, 0.6], rot: [0.6, 1.2, 0.2], scale: 1.9, float: 0.9 }),
    at(2, SCOOTER),
    at(2, { kind: 'bag', pos: [4.5, 0.9, 0.2], rot: [0, -0.4, 0], scale: 1.1, float: 0.9 }),
    at(2, { kind: 'pin', pos: [1.9, 1.0, 0.4], scale: 1.1, float: 1 }),
  ],
  patients: [
    at(0, { kind: 'phone', pos: [3.0, 0.1, 0], rot: [0.12, -0.45, 0.08], scale: 1.7, float: 0.5 }),
    at(0, { kind: 'pin', pos: [1.6, 1.3, 0.6], scale: 1.0, float: 1 }),
    at(1, { kind: 'pin', pos: [2.0, 1.0, 0.5], scale: 1.0, float: 1 }),
    at(1, { kind: 'pin', pos: [3.5, 1.4, 0], scale: 1.1, float: 1.2 }),
    at(1, { kind: 'pin', pos: [4.3, 0.2, 0.6], scale: 0.9, color: '#94a3b8', float: 1 }),
    at(2, { kind: 'clipboard', pos: [3.0, 0.2, 0], rot: [0.08, -0.4, -0.06], scale: 1.6, float: 0.6 }),
    at(2, { kind: 'capsule', pos: [4.4, -0.8, 0.6], rot: [0.4, 0.2, 0.9], scale: 2.6, colors: GREEN, split: true, float: 1 }),
    at(3, { kind: 'bag', pos: [3.1, -0.1, 0], rot: [0, -0.4, 0], scale: 1.7, float: 0.6 }),
    at(3, { kind: 'cross', pos: [4.4, 1.1, 0], scale: 0.55, float: 0.8 }),
  ],
  pharmacies: [
    at(0, { kind: 'shelf', pos: [3.1, 0.2, -0.7], rot: [0.04, -0.32, 0], scale: 1.0 }),
    at(0, { kind: 'box', pos: [1.6, -1.0, 0.9], rot: [0.2, 0.5, 0.1], scale: 1.0, brand: 'Apaisa', color: '#0369A1', float: 0.9 }),
    at(1, { kind: 'clipboard', pos: [3.0, 0.2, 0], rot: [0.08, -0.4, -0.06], scale: 1.6, float: 0.6 }),
    at(1, { kind: 'cross', pos: [4.4, 1.3, 0], scale: 0.55, float: 0.8 }),
    at(2, { kind: 'box', pos: [3.0, -0.3, 0.3], rot: [0.2, -0.6, 0.05], scale: 1.3, brand: 'Vitalis', color: '#C2410C', float: 0.5 }),
    at(2, { kind: 'blister', pos: [1.8, 0.8, 0.8], rot: [0.3, 0.5, -0.3], scale: 1.0, label: CALMORA, float: 0.9 }),
    at(2, { kind: 'amber', pos: [4.5, -0.5, 0.5], rot: [0.05, 0.2, 0.05], scale: 1.0, label: APAISA, float: 0.7 }),
    at(3, SCOOTER),
    at(3, { kind: 'bag', pos: [4.5, 0.9, 0.2], rot: [0, -0.4, 0], scale: 1.1, float: 0.9 }),
  ],
  doctors: [
    at(0, { kind: 'clipboard', pos: [2.8, 0.2, 0], rot: [0.08, -0.4, -0.06], scale: 1.6, float: 0.6 }),
    at(0, { kind: 'stethoscope', pos: [4.3, -0.6, 0.6], rot: [0.3, -0.5, 0.4], scale: 1.5, float: 0.9 }),
    at(1, { kind: 'envelope', pos: [3.0, 0.3, 0], rot: [0.1, -0.45, 0.08], scale: 1.6, float: 0.8 }),
    at(1, { kind: 'pen', pos: [4.4, 1.3, -0.3], rot: [0.2, 0.3, -0.9], scale: 1.3, float: 1 }),
    at(2, { kind: 'pin', pos: [2.0, 1.0, 0.5], scale: 1.1, float: 1 }),
    at(2, { kind: 'pin', pos: [3.6, 1.3, 0], scale: 1.0, float: 1.2 }),
    at(2, { kind: 'capsule', pos: [3.0, -0.6, 0.8], rot: [0.4, 0.2, 0.9], scale: 2.8, colors: TEAL, split: true, float: 1 }),
    at(3, { kind: 'phone', pos: [3.0, 0.1, 0], rot: [0.12, -0.45, 0.08], scale: 1.7, float: 0.5 }),
    at(3, { kind: 'capsule', pos: [4.4, -0.9, 0.5], rot: [1.2, 0.2, 0.3], scale: 2.4, colors: SKY, float: 1.1 }),
  ],
};
for (const [k, items] of Object.entries(STORIES)) COMPOSITIONS[k as CompositionName].items.push(...(items as Item[]));

// The soft background light per page (it replaces the old cone shapes): strongest where a hero or a form sits.
const LIGHT: Partial<Record<CompositionName, number>> = {
  home: 1,
  auth: 1,
  register: 1,
  recover: 0.8,
  pharmacies: 0.8,
  'app-home': 0.6,
  'app-pharmacy': 0.5,
};
for (const [k, v] of Object.entries(LIGHT)) COMPOSITIONS[k as CompositionName].light = v;

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
  if (at('/privacy')) return 'privacy';
  if (at('/terms') || at('/legal')) return 'terms';
  if (at('/register')) return 'register';
  if (at('/forgot-password') || at('/reset-password')) return 'recover';
  return 'auth';
}
