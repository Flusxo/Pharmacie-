/**
 * Library of pictures rendered from our own 3D scenes (add-on Part D / C2). `npm run render` draws each
 * shot in the dev-only /render page, screenshots it and writes AVIF/WebP sizes + a blur placeholder to
 * frontend/public/renders and src/render/manifest.json. Everything here is our own work (see docs/ASSETS.md).
 */
import { COMPOSITIONS, type CompositionName, type Item } from '../three/compositions';
import type { LabelSpec } from '../three/textures';

export interface Shot {
  id: string;
  /** largest width rendered (3840 for heroes) */
  width: 3840 | 1920 | 1600 | 1024 | 800;
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
  /** exact camera of the live stage: no auto-framing (hero stills) */
  fixed?: boolean;
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
const SKY: [string, string] = ['#0ea5e9', '#F8FAFC'];
const AMBER: [string, string] = ['#F59E0B', '#FEF3C7'];

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
  // ---- scenes (1920 px, 4:3) ----
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
    id: 'cut-scooter',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [1.6, 1.1, 5.2], target: [0, 0.5, 0], fov: 30 },
    shadowY: -0.02,
    items: [{ kind: 'scooter', pos: [0, 0, 0], rot: [0, -0.55, 0], scale: 2.4 }],
  },
  {
    id: 'cut-pillbottle',
    width: 1600,
    aspect: 1,
    bg: 'transparent',
    camera: { pos: [0, 0.7, 5], target: [0, 0.4, 0], fov: 30 },
    shadowY: -0.62,
    items: [{ kind: 'pillbottle', pos: [0, 0, 0], rot: [0, -0.15, 0], scale: 1.5, label: L('Vitalis', '1000 UI', '#C2410C', '#FED7AA') }],
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
export const OPENABLE = ['syrup', 'drops', 'spray', 'tablet', 'capsule', 'cream'];
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
  const flat = m.form === 'pen' || m.form === 'inhaler';
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

// ---- Hero stills: what the live stage shows at the top of each page, rendered with the same camera, so the page
// looks the same from the first frame and the live 3D fades in over it. Landscape and portrait (phones). ----
export const HERO_STILLS: CompositionName[] = [
  'home',
  'how',
  'patients',
  'pharmacies',
  'doctors',
  'about',
  'contact',
  'faq',
  'auth',
  'register',
];

export function heroStill(name: CompositionName, portrait: boolean): Shot {
  const c = COMPOSITIONS[name];
  const items = c.items
    .filter((it) => it.story === undefined && it.pos[1] > -4.5 && it.kind !== 'route' && it.kind !== 'scooter' && it.kind !== 'field')
    .map((it): Item => {
      const hero = it.pos[1] > -3;
      const [x, y, z] = it.pos;
      if (!portrait) return { ...it, split: false };
      // the same remapping as the live stage on a phone (PageScene ItemView)
      const pos: [number, number, number] =
        it.kind === 'interior' ? [x * 0.3, y, z] : hero ? [(x - c.heroX) * 0.42, y * 0.62 + 1.3, z] : [Math.sign(x) * 1.5, y, z - 0.5];
      return { ...it, pos, scale: (it.scale ?? 1) * 0.62, split: false };
    });
  return {
    id: `hero-${name}${portrait ? '-p' : ''}`,
    width: portrait ? 800 : 1920,
    aspect: portrait ? 400 / 820 : 16 / 9,
    bg: 'transparent',
    camera: { pos: [0, 0.3, 9], target: [0, 0, 0], fov: 35 },
    fixed: true,
    items,
  };
}
for (const n of HERO_STILLS) SHOTS.push(heroStill(n, false), heroStill(n, true));
