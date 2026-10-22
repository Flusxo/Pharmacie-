/**
 * Responsive picture from the render library (frontend/public/renders, manifest from npm run render):
 * AVIF srcset + WebP fallback, lazy loading, blur-up placeholder, and optional subtle motion that only
 * uses transform / opacity: slow zoom, hover tilt, scroll parallax, gentle float. A missing picture
 * renders nothing (the page never breaks on a missing file).
 */
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { m as motion, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';
import manifestJson from '../render/manifest.json';

interface Entry {
  w: number;
  h: number;
  widths: number[];
  webp: number;
  blur: string;
  alpha: boolean;
}
const MANIFEST = manifestJson as Record<string, Entry>;
export const hasPicture = (id: string) => id in MANIFEST;

export type PictureEffect = 'zoom' | 'tilt' | 'parallax' | 'float';

export function Picture({
  id,
  alt,
  sizes = '(max-width: 860px) 100vw, 50vw',
  className = '',
  priority = false,
  effects = [],
  style,
}: {
  id: string;
  /** empty string = decorative */
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  effects?: PictureEffect[];
  style?: CSSProperties;
}) {
  const e = MANIFEST[id];
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-6%', '6%']);
  const parallax = effects.includes('parallax') && !reduced;
  if (!e || failed) return null;

  const tilt = effects.includes('tilt') && !reduced;
  const onMove = (ev: PointerEvent<HTMLDivElement>) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--rx', `${((ev.clientY - r.top) / r.height - 0.5) * -8}deg`);
    ref.current.style.setProperty('--ry', `${((ev.clientX - r.left) / r.width - 0.5) * 10}deg`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  const classes = [
    'picture',
    e.alpha ? 'cutout' : 'framed',
    loaded ? 'loaded' : '',
    !reduced ? effects.map((f) => `fx-${f}`).join(' ') : '',
    className,
  ].join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      style={{ aspectRatio: `${e.w} / ${e.h}`, ['--blur' as string]: `url("${e.blur}")`, ...style }}
      onPointerMove={tilt ? onMove : undefined}
      onPointerLeave={tilt ? onLeave : undefined}
      data-testid="picture"
      data-id={id}
    >
      <motion.picture style={parallax ? { y } : undefined}>
        <source type="image/avif" srcSet={e.widths.map((w) => `/renders/${id}-${w}.avif ${w}w`).join(', ')} sizes={sizes} />
        <img
          src={`/renders/${id}-${e.webp}.webp`}
          alt={alt}
          width={e.w}
          height={e.h}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </motion.picture>
    </div>
  );
}
