/**
 * Generated medicine pack (SVG), shaped by form and coloured by category, with the name and dosage
 * printed legibly (font size shrinks to fit, text is never cropped). Used wherever a medicine is shown;
 * a real `imageUrl` is shown instead when present, with this as the fallback.
 */
import { useState } from 'react';

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

/** Split a name into at most 2 lines of ~max chars. */
function lines(text: string, max: number): string[] {
  const words = text.split(' ');
  const out: string[] = [''];
  for (const w of words) {
    const cur = out[out.length - 1];
    if ((cur + ' ' + w).trim().length <= max || cur === '') out[out.length - 1] = (cur + ' ' + w).trim();
    else if (out.length < 2) out.push(w);
    else out[1] = `${out[1]} ${w}`;
  }
  return out;
}
const fit = (text: string, width: number, base: number) => Math.max(7, Math.min(base, (width / Math.max(text.length, 1)) * 1.75));

interface Props {
  name: string;
  dosage: string;
  form: string;
  category: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}

export function PackImage({ name, dosage, form, category, imageUrl, size, className }: Props) {
  const [broken, setBroken] = useState(false);
  const label = `${name} — ${dosage}`;
  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={label}
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
  const title = lines(name.replace(/\s+\d.*$/, '') || name, 14);
  const titleSize = Math.min(...title.map((l) => fit(l, 120, 17)));
  const dose = dosage.length > 18 ? dosage.slice(0, 18) : dosage;
  const doseSize = fit(dose, 110, 13);
  const id = `g-${category}-${form}`;

  const text = (y: number) => (
    <>
      {title.map((l, i) => (
        <text
          key={i}
          x="100"
          y={y + i * (titleSize + 3)}
          textAnchor="middle"
          fontSize={titleSize}
          fontWeight="700"
          fill={dark}
          fontFamily="Inter Variable, system-ui, sans-serif"
        >
          {l}
        </text>
      ))}
      <text
        x="100"
        y={y + title.length * (titleSize + 3) + doseSize}
        textAnchor="middle"
        fontSize={doseSize}
        fontWeight="600"
        fill="#334155"
        fontFamily="Inter Variable, system-ui, sans-serif"
      >
        {dose}
      </text>
    </>
  );
  const cross = (x: number, y: number, s: number) => (
    <path
      d={`M${x - s / 6} ${y - s / 2}h${s / 3}v${s / 3}h${s / 3}v${s / 3}h-${s / 3}v${s / 3}h-${s / 3}v-${s / 3}h-${s / 3}v-${s / 3}h${s / 3}z`}
      fill={dark}
    />
  );

  let body;
  switch (form) {
    case 'syrup':
    case 'drops':
      body = (
        <g>
          <rect x="82" y="18" width="36" height="26" rx="6" fill="#F8FAFC" stroke="#CBD5E1" />
          <rect x="88" y="40" width="24" height="12" fill="#92400E" opacity="0.85" />
          <path d="M58 70q0-18 22-18h40q22 0 22 18v100q0 14-14 14H72q-14 0-14-14z" fill={`url(#${id})`} />
          <path d="M66 74q0-10 14-10" stroke="#fff" strokeOpacity="0.5" strokeWidth="4" fill="none" />
          <rect x="62" y="92" width="76" height="70" rx="8" fill="#fff" />
          {cross(78, 104, 12)}
          {text(118)}
        </g>
      );
      break;
    case 'cream':
      body = (
        <g transform="rotate(-18 100 100)">
          <rect x="88" y="16" width="24" height="18" rx="4" fill="#F8FAFC" stroke="#CBD5E1" />
          <path d="M70 34h60l10 130H60z" fill={`url(#${id})`} />
          <path d="M58 164h84v14H58z" fill={dark} />
          <rect x="72" y="70" width="56" height="74" rx="6" fill="#fff" />
          <g transform="translate(0 -26)">{text(118)}</g>
        </g>
      );
      break;
    case 'sachet':
      body = (
        <g>
          <path d="M44 34h112l-4 8 4 8v116l-4 8 4 8H44l4-8-4-8V50l4-8z" fill={`url(#${id})`} />
          <rect x="54" y="66" width="92" height="88" rx="8" fill="#fff" />
          {cross(100, 52, 14)}
          {text(92)}
        </g>
      );
      break;
    case 'inhaler':
      body = (
        <g>
          <rect x="74" y="20" width="52" height="118" rx="20" fill={`url(#${id})`} />
          <path d="M82 132h52l14 24q4 10-6 12H86z" fill="#E2E8F0" stroke="#CBD5E1" />
          <rect x="50" y="150" width="100" height="40" rx="10" fill="#fff" stroke="#CBD5E1" />
          <g transform="translate(0 46)">{text(116)}</g>
        </g>
      );
      break;
    case 'pen':
      body = (
        <g>
          <g transform="rotate(-60 100 80) translate(0 -20)">
            <rect x="88" y="10" width="24" height="26" rx="5" fill={dark} />
            <rect x="84" y="34" width="32" height="120" rx="12" fill={`url(#${id})`} />
            <rect x="94" y="154" width="12" height="16" rx="3" fill="#94A3B8" />
            <rect x="90" y="60" width="20" height="50" rx="4" fill="#fff" />
          </g>
          <rect x="44" y="118" width="112" height="62" rx="10" fill="#fff" stroke="#CBD5E1" />
          <g transform="translate(0 16)">{text(118)}</g>
        </g>
      );
      break;
    case 'spray':
      body = (
        <g>
          <rect x="90" y="12" width="20" height="30" rx="8" fill="#F8FAFC" stroke="#CBD5E1" />
          <rect x="80" y="38" width="40" height="14" rx="4" fill="#E2E8F0" />
          <rect x="62" y="50" width="76" height="136" rx="18" fill={`url(#${id})`} />
          <rect x="68" y="84" width="64" height="80" rx="8" fill="#fff" />
          {cross(100, 72, 12)}
          {text(106)}
        </g>
      );
      break;
    case 'lozenge':
    case 'tablet':
    case 'capsule':
    default:
      body = (
        <g>
          <path d="M40 46l18-16h112l-18 16z" fill={light} />
          <path d="M152 46l18-16v124l-18 16z" fill={dark} opacity="0.85" />
          <rect x="40" y="46" width="112" height="124" rx="6" fill={`url(#${id})`} />
          <rect x="48" y="78" width="96" height="80" rx="6" fill="#fff" />
          <circle cx="62" cy="62" r="7" fill="#fff" opacity="0.9" />
          {cross(62, 62, 10)}
          <g transform="translate(-4 0)">{text(102)}</g>
          {(form === 'capsule' || form === 'tablet') && (
            <g transform="translate(124 160)">
              {form === 'capsule' ? (
                <g transform="rotate(-30)">
                  <rect x="-16" y="-7" width="32" height="14" rx="7" fill={dark} />
                  <rect x="0" y="-7" width="16" height="14" rx="7" fill="#F8FAFC" />
                </g>
              ) : (
                <circle r="10" fill="#F8FAFC" stroke="#CBD5E1" />
              )}
            </g>
          )}
        </g>
      );
  }

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label} width={size} height={size} className={className ?? 'pack'}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="190" rx="62" ry="6" fill="#0F172A" opacity="0.08" />
      {body}
    </svg>
  );
}
