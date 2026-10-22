/**
 * Generated medicine pack (SVG), shaped by form and coloured by category. The name and dosage are fitted
 * inside the white label by `fitLabel` (wrap on up to 3 lines, shrink until it fits): never cropped, never
 * outside the label. A real `imageUrl` is shown instead when present, with this as the fallback.
 */
import { useState, type ReactNode } from 'react';
import { fitLabel, packTitle, type Box } from '../lib/labelFit';

export const CATEGORY_COLORS: Record<string, [string, string]> = {
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
export const colorsFor = (category: string): [string, string] => CATEGORY_COLORS[category] ?? ['#334155', '#E2E8F0'];

interface Layout {
  /** White label drawn on the pack. */
  label: Box;
  /** Area the text must stay inside (label minus padding and the brand band). */
  text: Box;
  /** Optional rotation of the whole pack (degrees, around the centre). */
  rotate?: number;
}

/** Label geometry per form (viewBox 200 × 200). Exported for the fit test. */
export const LAYOUTS: Record<string, Layout> = {
  syrup: { label: { x: 52, y: 84, w: 96, h: 88 }, text: { x: 57, y: 100, w: 86, h: 68 } },
  drops: { label: { x: 52, y: 84, w: 96, h: 88 }, text: { x: 57, y: 100, w: 86, h: 68 } },
  cream: { label: { x: 54, y: 60, w: 92, h: 92 }, text: { x: 58, y: 76, w: 84, h: 72 }, rotate: -10 },
  sachet: { label: { x: 52, y: 64, w: 96, h: 94 }, text: { x: 57, y: 80, w: 86, h: 74 } },
  inhaler: { label: { x: 40, y: 118, w: 120, h: 70 }, text: { x: 46, y: 133, w: 108, h: 52 } },
  pen: { label: { x: 40, y: 114, w: 120, h: 74 }, text: { x: 46, y: 129, w: 108, h: 56 } },
  spray: { label: { x: 56, y: 80, w: 88, h: 94 }, text: { x: 61, y: 96, w: 78, h: 74 } },
  box: { label: { x: 46, y: 74, w: 100, h: 76 }, text: { x: 51, y: 90, w: 90, h: 56 } },
};
export const layoutFor = (form: string): Layout => LAYOUTS[form] ?? LAYOUTS.box;

interface Props {
  name: string;
  dosage: string;
  form: string;
  category: string;
  imageUrl?: string | null;
  /** Prints an "Rx" mark on the label for prescription medicines. */
  rx?: boolean;
  size?: number;
  className?: string;
}

export function PackImage({ name, dosage, form, category, imageUrl, rx, size, className }: Props) {
  const [broken, setBroken] = useState(false);
  const alt = `${name} — ${dosage}`;
  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        width={size}
        height={size}
        className={className ?? 'pack'}
        style={{ objectFit: 'contain', aspectRatio: '1 / 1' }}
        onError={() => setBroken(true)}
        loading="lazy"
      />
    );
  }
  const [dark, light] = colorsFor(category);
  const layout = layoutFor(form);
  const lines = fitLabel(packTitle(name), dosage, layout.text);
  const id = `g-${category}-${form}`;
  const { label: lb } = layout;
  const band = 12;

  const label = (
    <g data-testid="pack-label">
      <rect x={lb.x} y={lb.y} width={lb.w} height={lb.h} rx="7" fill="#fff" />
      <path d={`M${lb.x} ${lb.y + 7}a7 7 0 0 1 7 -7h${lb.w - 14}a7 7 0 0 1 7 7v${band - 7}h-${lb.w}z`} fill={dark} />
      <Cross x={lb.x + 9} y={lb.y + band / 2 + 0.5} s={8} fill="#fff" />
      {rx && (
        <text x={lb.x + lb.w - 5} y={lb.y + band - 3} textAnchor="end" fontSize="8" fontWeight="800" fill="#fff" fontFamily="Inter Variable, system-ui, sans-serif">
          Rx
        </text>
      )}
      {lines.map((l, i) => (
        <text
          key={i}
          x={layout.text.x + layout.text.w / 2}
          y={l.y}
          textAnchor="middle"
          fontSize={l.size}
          fontWeight={l.weight}
          fill={l.weight === 700 ? dark : '#334155'}
          fontFamily="Inter Variable, system-ui, sans-serif"
        >
          {l.text}
        </text>
      ))}
    </g>
  );

  let body: ReactNode;
  switch (form) {
    case 'syrup':
    case 'drops':
      body = (
        <>
          <rect x="80" y="14" width="40" height="28" rx="6" fill="#F8FAFC" stroke="#CBD5E1" />
          <rect x="86" y="40" width="28" height="12" fill="#78350F" opacity="0.85" />
          <path d="M46 72q0-20 24-20h60q24 0 24 20v104q0 14-14 14H60q-14 0-14-14z" fill={`url(#${id})`} />
          <path d="M54 80q0-14 16-16" stroke="#fff" strokeOpacity="0.55" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      );
      break;
    case 'cream':
      body = (
        <>
          <rect x="88" y="14" width="24" height="18" rx="4" fill="#F8FAFC" stroke="#CBD5E1" />
          <path d="M50 32h100l12 136H38z" fill={`url(#${id})`} />
          <path d="M34 166h132v14H34z" fill={dark} />
        </>
      );
      break;
    case 'sachet':
      body = (
        <>
          <path d="M40 30h120l-4 8 4 8v122l-4 8 4 8H40l4-8-4-8V46l4-8z" fill={`url(#${id})`} />
          <path d="M40 46h120" stroke="#fff" strokeOpacity="0.5" strokeDasharray="3 3" />
        </>
      );
      break;
    case 'inhaler':
      body = (
        <>
          <rect x="78" y="8" width="44" height="90" rx="18" fill={`url(#${id})`} />
          <path d="M70 94h60v14q0 8-8 8H78q-8 0-8-8z" fill="#E2E8F0" stroke="#CBD5E1" />
        </>
      );
      break;
    case 'pen':
      body = (
        <g transform="rotate(-62 100 62)">
          <rect x="90" y="-6" width="20" height="24" rx="5" fill={dark} />
          <rect x="86" y="16" width="28" height="118" rx="12" fill={`url(#${id})`} />
          <rect x="95" y="134" width="10" height="14" rx="3" fill="#94A3B8" />
          <rect x="92" y="46" width="16" height="44" rx="4" fill="#fff" opacity="0.9" />
        </g>
      );
      break;
    case 'spray':
      body = (
        <>
          <rect x="90" y="8" width="20" height="30" rx="8" fill="#F8FAFC" stroke="#CBD5E1" />
          <rect x="80" y="34" width="40" height="14" rx="4" fill="#E2E8F0" />
          <rect x="50" y="46" width="100" height="140" rx="22" fill={`url(#${id})`} />
        </>
      );
      break;
    default:
      body = (
        <>
          <path d="M38 44l18-16h112l-18 16z" fill={light} />
          <path d="M150 44l18-16v126l-18 16z" fill={dark} opacity="0.85" />
          <rect x="38" y="44" width="112" height="126" rx="6" fill={`url(#${id})`} />
          {(form === 'capsule' || form === 'tablet') && (
            <g transform="translate(130 160)">
              {form === 'capsule' ? (
                <g transform="rotate(-30)">
                  <rect x="-12" y="-5" width="24" height="10" rx="5" fill={dark} />
                  <rect x="0" y="-5" width="12" height="10" rx="5" fill="#F8FAFC" />
                </g>
              ) : (
                <circle r="7" fill="#F8FAFC" stroke="#CBD5E1" />
              )}
            </g>
          )}
        </>
      );
  }

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={alt} width={size} height={size} className={className ?? 'pack'}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="192" rx="64" ry="6" fill="#0F172A" opacity="0.08" />
      <g transform={layout.rotate ? `rotate(${layout.rotate} 100 100)` : undefined}>
        {body}
        {label}
      </g>
    </svg>
  );
}

function Cross({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  const t = s / 3;
  return <path d={`M${x - t / 2} ${y - s / 2}h${t}v${t}h${t}v${t}h-${t}v${t}h-${t}v-${t}h-${t}v-${t}h${t}z`} fill={fill} />;
}
