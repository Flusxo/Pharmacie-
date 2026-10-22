/**
 * Library of pictures rendered from our own 3D scenes (add-on Part D / C2). `npm run render` draws each
 * shot in the dev-only /render page, screenshots it and writes AVIF/WebP sizes + a blur placeholder to
 * frontend/public/renders and src/render/manifest.json. Everything here is our own work (see docs/ASSETS.md).
 */
import type { Item } from '../three/compositions';
import type { LabelSpec } from '../three/textures';

export interface Shot {
  id: string;
  /** largest width rendered (3840 for heroes) */
  width: 3840 | 1920 | 1600 | 1024;
  /** width / height */
  aspect: number;
  /** transparent = cut-out with alpha (floating objects with a soft shadow) */
  bg: 'transparent' | [string, string];
  camera: { pos: [number, number, number]; target: [number, number, number]; fov: number };
  items: Item[];
  /** contact shadow under the objects (world y), omitted = none */
  shadowY?: number;
  /** share of the frame the objects fill (camera auto-framing); default 0.8, > 1 bleeds off the edges */
  fit?: number;
  /** query string of the /render page (medicine packs) */
  query?: string;
}

const L = (name: string, dosage: string, color: string, light: string, cip = '3400930001234'): LabelSpec => ({
  name,
  dosage,
  color,
  light,
  cip,
});
const TEAL: [string, string] = ['#0d9488', '#F8FAFC'];
const GREEN: [string, string] = ['#10B981', '#ECFDF5'];
const SKY: [string, string] = ['#0ea5e9', '#F8FAFC'];
const AMBER: [string, string] = ['#F59E0B', '#FEF3C7'];
const ROSE: [string, string] = ['#E11D48', '#FFF1F2'];
const VIOLET: [string, string] = ['#7C3AED', '#F5F3FF'];
const LIME: [string, string] = ['#65A30D', '#F7FEE7'];
const ORANGE: [string, string] = ['#EA580C', '#FFEDD5'];

const cam = (z = 8, y = 0.2, fov = 30): Shot['camera'] => ({ pos: [0, y, z], target: [0, 0, 0], fov });

/** A scatter of capsules (deterministic). */
function capsules(n: number, seed: number, colors: [string, string][], spread: [number, number, number], scale = [2.4, 3.6]): Item[] {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // Rejection sampling: capsules keep a minimum distance so they never intersect.
  const placed: [number, number, number][] = [];
  const minDist = 0.95 * scale[1] * 0.34;
  return Array.from({ length: n }, (_, i) => {
    let pos: [number, number, number] = [0, 0, 0];
    for (let tries = 0; tries < 60; tries++) {
      pos = [(r() - 0.5) * spread[0], (r() - 0.5) * spread[1], (r() - 0.5) * spread[2]];
      if (placed.every((p) => Math.hypot(p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]) > minDist)) break;
    }
    placed.push(pos);
    return {
      kind: 'capsule' as const,
      pos,
      rot: [r() * 3, r() * 3, r() * 3] as [number, number, number],
      scale: scale[0] + r() * (scale[1] - scale[0]),
      colors: colors[i % colors.length],
    };
  });
}

export const SHOTS: Shot[] = [
  // ---- heroes (3840 px) ----
  {
    id: 'hero-capsules',
    fit: 1.15,
    width: 3840,
    aspect: 16 / 9,
    bg: ['#c9f1ea', '#5cc4b7'],
    camera: cam(9),
    items: capsules(14, 7, [TEAL, TEAL, GREEN], [9, 4.6, 3]),
  },
  {
    id: 'hero-capsules-green',
    fit: 1.15,
    width: 3840,
    aspect: 16 / 9,
    bg: ['#0f3d3a', '#0a2a2a'],
    camera: cam(9),
    items: capsules(14, 19, [GREEN, TEAL, LIME], [9, 4.6, 3]),
  },
  {
    id: 'hero-spill',
    fit: 0.95,
    width: 3840,
    aspect: 16 / 9,
    bg: ['#eef6fc', '#cfe3f3'],
    camera: { pos: [0, 2.2, 7.2], target: [0, -0.3, 0], fov: 30 },
    shadowY: -0.62,
    items: [
      {
        kind: 'pillbottle',
        pos: [-1.9, -0.05, 0],
        rot: [0, 0.3, Math.PI / 2 - 0.1],
        scale: 1.9,
        label: L('Vitalis', '1000 UI', '#0F766E', '#99F6E4'),
      },
      ...capsules(9, 3, [ROSE, AMBER, SKY, GREEN, VIOLET], [3.6, 0.2, 2.2], [2.2, 2.8]).map((it, i) => ({
        ...it,
        pos: [0.1 + i * 0.38 + (i % 2) * 0.1, -0.5 + (i % 3) * 0.02, -0.6 + ((i * 37) % 10) / 8] as [number, number, number],
        rot: [Math.PI / 2, (i * 1.3) % 3, 0] as [number, number, number],
      })),
      ...[0, 1, 2, 3, 4].map((i) => ({
        kind: 'tablet' as const,
        pos: [0.4 + i * 0.55, -0.58, 0.7 + (i % 2) * 0.4] as [number, number, number],
        rot: [Math.PI / 2, 0, i] as [number, number, number],
        scale: 2.2,
      })),
    ],
  },
  {
    id: 'hero-counter',
    fit: 0.95,
    width: 3840,
    aspect: 16 / 9,
    bg: ['#f4fbf9', '#d8ece7'],
    camera: { pos: [0.3, 1.5, 5.2], target: [0, 0.6, 0], fov: 34 },
    items: [
      { kind: 'counter', pos: [0, 0, 0] },
      { kind: 'shelf', pos: [0, 1.5, -1.8], scale: 1.2 },
      { kind: 'cross', pos: [1.9, 2.55, -1.6], scale: 0.3 },
      { kind: 'amber', pos: [-0.6, 0.44, 0.1], rot: [0, -0.2, 0], scale: 1.1, label: L('Apaisa', '150 ml', '#065F46', '#A7F3D0') },
      { kind: 'pillbottle', pos: [0.5, 0.44, 0.2], rot: [0, 0.4, 0], scale: 0.9, label: L('Calmora', '500 mg', '#0F766E', '#99F6E4') },
      { kind: 'capsule', pos: [1.25, 0.5, 0.45], rot: [Math.PI / 2, 0, 0.6], scale: 2, colors: TEAL },
      { kind: 'tablet', pos: [-1.4, 0.47, 0.4], rot: [Math.PI / 2, 0, 0], scale: 2 },
    ],
  },
  {
    id: 'hero-shelves',
    fit: 0.95,
    width: 3840,
    aspect: 16 / 9,
    bg: ['#f7f5ef', '#e3eee8'],
    camera: { pos: [0.6, 0.2, 5.4], target: [0, 0, 0], fov: 34 },
    items: [
      { kind: 'shelf', pos: [0, 0, 0], rot: [0, -0.18, 0], scale: 1.35 },
      { kind: 'cross', pos: [1.75, 1.85, -0.3], scale: 0.35 },
    ],
  },
  {
    id: 'hero-abstract',
    fit: 1.15,
    width: 3840,
    aspect: 16 / 9,
    bg: ['#d6f5ef', '#8bd9cc'],
    camera: cam(8),
    items: [
      { kind: 'blob', pos: [-2.4, 0.6, -0.5], scale: 2.6, color: '#5eead4', blob: 'sphere' },
      { kind: 'blob', pos: [1.8, -0.2, 0.4], rot: [1.1, 0.4, 0], scale: 2.2, color: '#a7f3d0', blob: 'torus' },
      { kind: 'blob', pos: [3.6, 1.4, -1.2], rot: [0.3, 0, 0.9], scale: 1.6, color: '#ffffff', blob: 'pill' },
      { kind: 'blob', pos: [-0.2, -1.5, 1], rot: [0.2, 0, -0.6], scale: 1.4, color: '#99f6e4', blob: 'pill' },
      { kind: 'cross', pos: [-3.9, -1.1, 0.3], scale: 0.4 },
    ],
  },
  // ---- scenes (1920 px, 4:3) ----
  {
    id: 'scene-amber-bottles',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#f2fbf8', '#cfece5'],
    camera: { pos: [0, 0.9, 6], target: [0, 0.2, 0], fov: 30 },
    shadowY: -0.62,
    items: [
      { kind: 'amber', pos: [-0.9, 0, 0], rot: [0, -0.2, 0], scale: 1.4, label: L('Apaisa', '150 ml', '#065F46', '#A7F3D0') },
      { kind: 'pillbottle', pos: [0.75, -0.08, 0.3], rot: [0, 0.35, 0], scale: 1.25, label: L('Vitalis', '1000 UI', '#C2410C', '#FED7AA') },
      { kind: 'amber', pos: [1.9, -0.25, -0.8], rot: [0, 0.6, 0], scale: 0.95, label: L('Rhinova', '10 mg', '#7C3AED', '#DDD6FE') },
    ],
  },
  {
    id: 'scene-blister',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#f6faf9', '#dcebe7'],
    camera: { pos: [0, 1.6, 5.2], target: [0, 0, 0], fov: 30 },
    shadowY: -0.75,
    items: [
      { kind: 'blister', pos: [-0.3, 0, 0], rot: [-0.9, 0.3, -0.25], scale: 1.6, label: L('Calmora', '500 mg', '#0F766E', '#99F6E4') },
      { kind: 'tablet', pos: [1.3, -0.68, 0.6], rot: [Math.PI / 2, 0, 0.3], scale: 2.2 },
      { kind: 'tablet', pos: [1.8, -0.68, 0.1], rot: [Math.PI / 2, 0, 1.3], scale: 2.2 },
    ],
  },
  {
    id: 'scene-rainbow',
    fit: 1.05,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#fbfaf6', '#e9f2ee'],
    camera: cam(7),
    items: capsules(16, 31, [ROSE, AMBER, SKY, GREEN, VIOLET, LIME, ORANGE, TEAL], [6, 4, 2.5], [2.2, 3.2]),
  },
  {
    id: 'scene-vitamins',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#fff7ed', '#fde3c7'],
    camera: { pos: [0, 0.9, 6], target: [0, 0.1, 0], fov: 30 },
    shadowY: -0.62,
    items: [
      { kind: 'pillbottle', pos: [-0.6, 0, 0], rot: [0, 0.2, 0], scale: 1.45, label: L('Vitalis', '1000 UI', '#C2410C', '#FED7AA') },
      ...capsules(7, 5, [ORANGE, AMBER], [3.4, 0.3, 1.6], [2, 2.6]).map((it, i) => ({
        ...it,
        pos: [0.8 + (i % 4) * 0.45, -0.52, -0.4 + Math.floor(i / 4) * 0.7] as [number, number, number],
        rot: [Math.PI / 2, i, 0] as [number, number, number],
      })),
    ],
  },
  {
    id: 'scene-delivery',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#eef9f8', '#d1ece6'],
    camera: { pos: [1.6, 1.4, 5.6], target: [0, 0.4, 0], fov: 30 },
    shadowY: 0,
    items: [
      { kind: 'scooter', pos: [-0.4, 0, 0], rot: [0, 0.6, 0], scale: 1.5 },
      { kind: 'pin', pos: [1.8, 0.3, -0.4], scale: 0.9 },
      { kind: 'bag', pos: [1.2, 0.45, 0.9], rot: [0, -0.4, 0], scale: 0.7 },
    ],
  },
  {
    id: 'scene-doctor-desk',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#eef6fb', '#d5e6f2'],
    camera: { pos: [0, 2.4, 4.6], target: [0, 0, 0], fov: 32 },
    shadowY: -0.05,
    items: [
      { kind: 'clipboard', pos: [-0.5, 0, 0], rot: [-Math.PI / 2 + 0.05, 0, 0.2], scale: 1.4 },
      { kind: 'stethoscope', pos: [1.0, 0.05, 0.3], rot: [-Math.PI / 2, 0, -0.5], scale: 1.3 },
      { kind: 'capsule', pos: [0.9, 0.1, -0.7], rot: [Math.PI / 2, 0, 0.9], scale: 2.4, colors: SKY },
      { kind: 'pen', pos: [-1.6, 0.08, 0.6], rot: [Math.PI / 2, 0, 1.1], scale: 0.8 },
    ],
  },
  {
    id: 'scene-pharmacist',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#f1faf7', '#d3ece5'],
    camera: { pos: [0, 1.5, 5.4], target: [0, 1.0, 0], fov: 32 },
    items: [
      { kind: 'shelf', pos: [0, 1.6, -1.6], scale: 1.1 },
      { kind: 'figure-pharmacist', pos: [0, 0, -0.4], scale: 1.05 },
      { kind: 'counter', pos: [0, -0.1, 0.6], scale: 0.85 },
      { kind: 'amber', pos: [-0.9, 0.3, 0.7], scale: 0.8, label: L('Apaisa', '150 ml', '#065F46', '#A7F3D0') },
      { kind: 'box', pos: [0.8, 0.5, 0.7], rot: [0, -0.3, 0], scale: 0.6, brand: 'Calmora', color: '#065F46' },
    ],
  },
  {
    id: 'scene-doctor',
    fit: 0.85,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#eef6fb', '#d4e5f3'],
    camera: { pos: [0, 1.2, 5.2], target: [0, 0.9, 0], fov: 32 },
    shadowY: 0,
    items: [
      { kind: 'figure-doctor', pos: [-0.6, 0, 0], rot: [0, 0.25, 0], scale: 1.05 },
      { kind: 'clipboard', pos: [0.95, 1.1, 0.4], rot: [0.1, -0.4, 0.08], scale: 0.85 },
      { kind: 'capsule', pos: [1.6, 0.4, 0.2], rot: [0.4, 0.2, 0.9], scale: 2.4, colors: TEAL },
    ],
  },
  {
    id: 'scene-abstract-mint',
    fit: 1.05,
    width: 1920,
    aspect: 4 / 3,
    bg: ['#ecfdf5', '#c4efdb'],
    camera: cam(7),
    items: [
      { kind: 'blob', pos: [-1.3, 0.4, 0], rot: [1.0, 0.3, 0], scale: 2.1, color: '#5eead4', blob: 'torus' },
      { kind: 'blob', pos: [1.4, -0.3, 0.4], scale: 1.7, color: '#ffffff', blob: 'sphere' },
      { kind: 'blob', pos: [0.4, 1.4, -1], rot: [0, 0, 0.8], scale: 1.2, color: '#a7f3d0', blob: 'pill' },
    ],
  },
  // ---- cut-outs (transparent, 1600 px square) ----
  {
    id: 'cut-syrup',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0, 0.7, 5], target: [0, 0.4, 0], fov: 30 },
    shadowY: -0.62,
    items: [{ kind: 'amber', pos: [0, 0, 0], rot: [0, -0.15, 0], scale: 1.5, label: L('Hélicia', '150 ml', '#0369A1', '#BAE6FD') }],
  },
  {
    id: 'cut-tube',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0, 0.5, 4.6], target: [0, 0.1, 0], fov: 30 },
    shadowY: -0.9,
    items: [{ kind: 'tube', pos: [0, 0, 0], rot: [0, -0.2, -0.35], scale: 1.4, label: L('Dermalis', '1 %', '#BE185D', '#FBCFE8') }],
  },
  {
    id: 'cut-inhaler',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0, 0.6, 4.6], target: [0, 0.2, 0], fov: 30 },
    shadowY: -0.75,
    items: [{ kind: 'inhaler', pos: [0, 0, 0], rot: [0, -0.4, 0], scale: 1.5, label: L('Pulmo', '100 µg', '#4338CA', '#C7D2FE') }],
  },
  {
    id: 'cut-pen',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0, 0.6, 4.6], target: [0, 0.1, 0], fov: 30 },
    shadowY: -0.6,
    items: [{ kind: 'pen', pos: [0, 0, 0], rot: [0, 0, -0.9], scale: 1.4 }],
  },
  {
    id: 'cut-cross',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: cam(5, 0.3),
    items: [{ kind: 'cross', pos: [0, 0, 0], rot: [0.15, -0.45, 0], scale: 0.85 }],
  },
  {
    id: 'cut-phone',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: cam(5.2, 0.3),
    items: [
      { kind: 'phone', pos: [0, 0, 0], rot: [0.12, -0.45, 0.08], scale: 1.45 },
      { kind: 'pin', pos: [1.05, 0.7, 0.6], scale: 0.7 },
    ],
  },
  {
    id: 'cut-envelope',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: cam(5.2, 0.3),
    items: [
      { kind: 'envelope', pos: [-0.2, -0.1, 0], rot: [0.1, -0.45, 0.08], scale: 1.4 },
      { kind: 'cross', pos: [1.0, 0.85, -0.4], scale: 0.32 },
    ],
  },
  {
    id: 'cut-tablets',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: cam(5),
    items: capsules(6, 41, [TEAL, AMBER, SKY], [2.6, 2.2, 1.4], [2.6, 3.2]).concat([
      { kind: 'tablet', pos: [0.2, 0.1, 0.8], rot: [0.9, 0.3, 0], scale: 2.6 },
    ]),
  },
  {
    id: 'cut-bag',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0.6, 1.0, 4.4], target: [0, 0.2, 0], fov: 30 },
    shadowY: -0.45,
    items: [{ kind: 'bag', pos: [0, 0, 0], rot: [0, -0.4, 0], scale: 1.4 }],
  },
  {
    id: 'cut-capsule',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: cam(4.2),
    items: [{ kind: 'capsule', pos: [0, 0, 0], rot: [0.3, 0.2, 0.85], scale: 6.5, colors: TEAL }],
  },
];

export const shotById = (id: string) => SHOTS.find((s) => s.id === id);

// ---- medicine packs (Part G): one picture per medicine and view, 1024 px cut-outs ----

export interface MedSpec {
  name: string;
  dosage: string;
  form: string;
  category: string;
  rx: boolean;
}
export const MED_SLUG = (name: string, dosage: string) =>
  `${name} ${dosage}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
/** Forms whose cap comes off (the "open" view). */
export const OPENABLE = ['syrup', 'drops', 'tablet', 'capsule', 'cream'];
export const medViews = (form: string): ('front' | 'angle' | 'open')[] =>
  OPENABLE.includes(form) ? ['front', 'angle', 'open'] : ['front', 'angle'];

const CATEGORY_LABEL: Record<string, [string, string]> = {
  pain: ['#065F46', '#A7F3D0'],
  allergy: ['#7C3AED', '#DDD6FE'],
  cold: ['#0369A1', '#BAE6FD'],
  digestion: ['#B45309', '#FDE68A'],
  vitamins: ['#C2410C', '#FED7AA'],
  skin: ['#BE185D', '#FBCFE8'],
  antibiotics: ['#1D4ED8', '#BFDBFE'],
  diabetes: ['#0F766E', '#99F6E4'],
  cardio: ['#B91C1C', '#FECACA'],
  respiratory: ['#4338CA', '#C7D2FE'],
  hormones: ['#6D28D9', '#E9D5FF'],
};

export function medicineShot(m: MedSpec, view: 'front' | 'angle' | 'open'): Shot & { query: string } {
  const [color, light] = CATEGORY_LABEL[m.category] ?? ['#334155', '#E2E8F0'];
  const flat = m.form === 'pen' || m.form === 'inhaler' || m.form === 'spray';
  const rot: [number, number, number] =
    view === 'angle' ? [0.1, -0.62, flat ? -0.2 : 0] : [0, flat ? -0.25 : 0, flat && view === 'open' ? -0.2 : 0];
  const query = new URLSearchParams({
    med: MED_SLUG(m.name, m.dosage),
    view,
    name: m.name,
    dosage: m.dosage,
    form: m.form,
    category: m.category,
    rx: m.rx ? '1' : '0',
  }).toString();
  return {
    id: `med-${MED_SLUG(m.name, m.dosage)}-${view}`,
    width: 1024,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0, 0.5, 5], target: [0, 0.3, 0], fov: 28 },
    shadowY: undefined,
    fit: 0.82,
    items: [
      {
        kind: 'product',
        form: m.form,
        pos: [0, 0, 0],
        rot,
        scale: 1.5,
        open: view === 'open' ? 1 : 0,
        label: { name: m.name, dosage: m.dosage, color, light, cip: '3400930000000', rx: m.rx },
      },
    ],
    query,
  };
}

/** Rebuilds a medicine shot from the /render URL (used by the dev-only render page). */
export function shotFromParams(p: URLSearchParams): Shot | undefined {
  if (!p.get('med')) return undefined;
  return medicineShot(
    {
      name: p.get('name') ?? '',
      dosage: p.get('dosage') ?? '',
      form: p.get('form') ?? 'tablet',
      category: p.get('category') ?? '',
      rx: p.get('rx') === '1',
    },
    (p.get('view') as 'front' | 'angle' | 'open') ?? 'front',
  );
}
