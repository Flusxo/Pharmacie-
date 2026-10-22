/**
 * Still illustrations for the public pages (SVG, our own drawings). Shown as the hero visual and as the
 * fallback whenever the page's 3D scene cannot run (no WebGL, Low/Off quality, reduced data).
 */
import { PackImage } from '../PackImage';

export type ArtKind = 'home' | 'how' | 'patients' | 'pharmacies' | 'doctors' | 'about' | 'contact' | 'faq' | 'legal' | 'auth';

/** Glossy two-colour capsule. */
function Capsule({
  x,
  y,
  r = 0,
  a = '#0d9488',
  b = '#ffffff',
  s = 1,
}: {
  x: number;
  y: number;
  r?: number;
  a?: string;
  b?: string;
  s?: number;
}) {
  const id = `cap-${a.slice(1)}-${b.slice(1)}`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} stopOpacity="0.85" />
          <stop offset="0.5" stopColor={a} />
          <stop offset="1" stopColor="#063d38" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor={b} />
          <stop offset="1" stopColor="#c9dcd9" />
        </linearGradient>
      </defs>
      <ellipse cx="0" cy="34" rx="46" ry="7" fill="#0b2530" opacity="0.1" />
      <path d="M-44 -16a16 16 0 0 1 16-16h28v32h-28a16 16 0 0 1-16-16z" transform="translate(0 16)" fill={`url(#${id}-a)`} />
      <path d="M0 -16h28a16 16 0 0 1 0 32H0z" transform="translate(0 16)" fill={`url(#${id}-b)`} />
      <path d="M-36 -8h56" transform="translate(0 16)" stroke="#fff" strokeOpacity="0.7" strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

function Cross({ x, y, s = 40 }: { x: number; y: number; s?: number }) {
  const t = s / 3;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-s / 2 - 8} y={-s / 2 - 8} width={s + 16} height={s + 16} rx="14" fill="#10b981" opacity="0.18" />
      <path d={`M${-t / 2} ${-s / 2}h${t}v${t}h${t}v${t}h-${t}v${t}h-${t}v-${t}h-${t}v-${t}h${t}z`} fill="#10b981" />
    </g>
  );
}

function Tablet({ x, y, c = '#ffffff' }: { x: number; y: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="12" rx="20" ry="5" fill="#0b2530" opacity="0.1" />
      <ellipse cx="0" cy="0" rx="20" ry="13" fill={c} stroke="#cde5e1" />
      <path d="M-12 0h24" stroke="#cde5e1" strokeWidth="2" />
    </g>
  );
}

function Pin({ x, y, ok = true }: { x: number; y: number; ok?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0c-11-14-16-21-16-29a16 16 0 0 1 32 0c0 8-5 15-16 29z" fill={ok ? '#10b981' : '#94a3b8'} stroke="#fff" strokeWidth="3" />
      <circle cx="0" cy="-29" r="6" fill="#fff" />
    </g>
  );
}

export function HeroArt({ kind }: { kind: ArtKind }) {
  return (
    <div className={`hero-art hero-art-${kind}`}>
      <svg viewBox="0 0 480 400" role="presentation" className="hero-art-svg">
        <defs>
          <radialGradient id="art-glow" cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor="#5eead4" stopOpacity="0.45" />
            <stop offset="1" stopColor="#5eead4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="240" cy="190" r="190" fill="url(#art-glow)" />
        {kind === 'home' || kind === 'auth' ? (
          <>
            <g className="float-a">
              <Capsule x={120} y={120} r={-25} />
            </g>
            <g className="float-b">
              <Capsule x={380} y={90} r={20} a="#10b981" s={0.8} />
            </g>
            <g className="float-c">
              <Capsule x={360} y={300} r={-10} a="#0ea5e9" s={0.9} />
            </g>
            <Tablet x={110} y={310} />
            <Tablet x={160} y={330} c="#fde68a" />
            <Cross x={250} y={70} s={34} />
          </>
        ) : kind === 'patients' ? (
          <>
            <rect x="160" y="40" width="170" height="320" rx="30" fill="#0b2530" />
            <rect x="170" y="56" width="150" height="288" rx="22" fill="#e7f6f3" />
            <path d="M170 150c40 10 80-30 150-10M170 250c60-20 90 30 150 0M230 56v288" stroke="#cde5e1" strokeWidth="6" fill="none" />
            <Pin x={215} y={170} />
            <Pin x={280} y={230} />
            <Pin x={250} y={300} ok={false} />
            <circle cx="245" cy="215" r="8" fill="#3b82f6" stroke="#fff" strokeWidth="3" />
            <g className="float-a">
              <Capsule x={110} y={120} r={-30} s={0.8} />
            </g>
            <g className="float-b">
              <Capsule x={390} y={280} r={15} a="#10b981" s={0.8} />
            </g>
          </>
        ) : kind === 'pharmacies' ? (
          <>
            <rect x="70" y="60" width="340" height="250" rx="16" fill="#ffffff" stroke="#cde5e1" strokeWidth="3" />
            {[120, 200, 280].map((y) => (
              <rect key={y} x="70" y={y} width="340" height="8" fill="#cde5e1" />
            ))}
            <Cross x={240} y={30} s={30} />
          </>
        ) : kind === 'doctors' ? (
          <>
            <rect x="140" y="50" width="200" height="270" rx="18" fill="#ffffff" stroke="#cde5e1" strokeWidth="3" />
            <rect x="200" y="36" width="80" height="30" rx="10" fill="#0b6b5d" />
            {[110, 150, 190, 230].map((y, i) => (
              <g key={y}>
                <rect x="170" y={y} width="18" height="18" rx="5" fill={i < 2 ? '#10b981' : '#e7f6f3'} stroke="#cde5e1" />
                <rect x="200" y={y + 4} width={i % 2 ? 90 : 110} height="10" rx="5" fill="#cde5e1" />
              </g>
            ))}
            <path d="M120 150c-40 60 10 140 70 140 40 0 60-30 60-60" stroke="#0b2530" strokeWidth="8" fill="none" strokeLinecap="round" />
            <circle cx="250" cy="230" r="16" fill="#0d9488" stroke="#fff" strokeWidth="5" />
            <g className="float-a">
              <Capsule x={390} y={140} r={25} s={0.9} />
            </g>
          </>
        ) : kind === 'contact' ? (
          <>
            <g className="float-a">
              <rect x="110" y="110" width="260" height="180" rx="20" fill="#ffffff" stroke="#cde5e1" strokeWidth="3" />
              <path d="M110 130l130 90 130-90" fill="none" stroke="#0d9488" strokeWidth="8" strokeLinejoin="round" />
            </g>
            <g className="float-b">
              <Cross x={380} y={90} s={44} />
            </g>
            <g className="float-c">
              <Capsule x={110} y={320} r={-15} s={0.7} />
            </g>
          </>
        ) : kind === 'how' ? (
          <>
            {[
              [90, 200, '#0d9488'],
              [240, 120, '#10b981'],
              [390, 200, '#0b6b5d'],
            ].map(([x, y, c], i) => (
              <g key={i}>
                <circle cx={x as number} cy={y as number} r="46" fill="#ffffff" stroke={c as string} strokeWidth="6" />
                <circle cx={x as number} cy={y as number} r="16" fill={c as string} />
              </g>
            ))}
            <path
              d="M130 180q50-60 70-55M280 125q60 10 75 55"
              stroke="#0d9488"
              strokeWidth="5"
              fill="none"
              strokeDasharray="10 10"
              className="dash-move"
            />
            <g className="float-a">
              <Capsule x={240} y={300} r={-10} s={0.8} />
            </g>
          </>
        ) : (
          <>
            <g className="float-a">
              <circle cx="170" cy="170" r="90" fill="#5eead4" opacity="0.5" />
            </g>
            <g className="float-b">
              <rect x="230" y="150" width="160" height="160" rx="48" fill="#a7f3d0" opacity="0.7" transform="rotate(15 310 230)" />
            </g>
            <g className="float-c">
              <Capsule x={250} y={110} r={-20} />
            </g>
            <Cross x={140} y={300} s={36} />
          </>
        )}
      </svg>
      {kind === 'pharmacies' && (
        <div className="hero-art-shelf">
          {(
            [
              ['Calmora', '500 mg', 'tablet', 'pain'],
              ['Rhinova', '10 mg', 'tablet', 'allergy'],
              ['Dermalis', '1 %', 'cream', 'skin'],
              ['Apaisa', '150 ml', 'syrup', 'cold'],
              ['Vitalis', '1000 UI', 'drops', 'vitamins'],
              ['Glucora', '850 mg', 'tablet', 'diabetes'],
            ] as const
          ).map(([n, d, f, c]) => (
            <PackImage key={n} name={n} dosage={d} form={f} category={c} />
          ))}
        </div>
      )}
    </div>
  );
}
