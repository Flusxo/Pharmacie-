/**
 * Animation building blocks. Every timing comes from src/motion.ts. Only transform and opacity are
 * animated (plus a short blur on page change); everything is under 0.6 s except ambient loops.
 * Reduced motion: <MotionConfig reducedMotion> in App turns these into simple fades / no motion.
 */
import { Suspense, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { AnimatePresence, animate, m as motion, useInView, useReducedMotion as useFmReducedMotion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import { duration, easeOut, spring, stagger } from '../motion';
import { useReducedMotion } from '../lib/settings';
import { PageFallback } from './PageFallback';

/**
 * Route content with a page transition (fade + 12 px slide + slight blur) on every route change; the top bar stays fixed.
 * Entrance only: an exit phase would keep the old page mounted while it already reads the new URL
 * (it re-rendered with the wrong query and held back the next page).
 */
export function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
      // transitionEnd clears transform/filter: they would otherwise trap position:fixed dialogs inside the page.
      animate={{
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: duration.base, ease: easeOut },
        transitionEnd: { filter: 'none', transform: 'none' },
      }}
    >
      {/* Only the page area waits for a lazy page: the header and footer stay (no flash, no layout shift). */}
      <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
    </motion.div>
  );
}

/** Reveals once when scrolled into view; `index` staggers siblings. */
export function Reveal({
  children,
  index = 0,
  className,
  style,
  as = 'div',
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'li' | 'section';
}) {
  const M = motion[as];
  return (
    <M
      className={className}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: duration.base, ease: easeOut, delay: (index % 4) * stagger }}
    >
      {children}
    </M>
  );
}

/**
 * Number that counts up to its value when it scrolls into view (and counts up/down when it changes).
 * It shows the FINAL value from the start (slow JavaScript, no IntersectionObserver, printing: never a stuck 0) and,
 * when it enters the view, replays a short count-up from 0; a safety timer snaps to the final value if the animation
 * stalls.
 */
export function AnimatedNumber({
  value,
  format = (n: number) => String(Math.round(n)),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const shown = useRef(0);
  const [text, setText] = useState(format(value));
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      shown.current = value;
      setText(format(value));
      return;
    }
    // Safety: if frames are late, the final number is shown after 1.2 s whatever the animation did.
    const snap = setTimeout(() => {
      shown.current = value;
      setText(format(value));
    }, 1200);
    const controls = animate(shown.current, value, {
      duration: 0.8,
      ease: easeOut,
      onUpdate: (v) => {
        shown.current = v;
        setText(format(v));
      },
    });
    return () => {
      clearTimeout(snap);
      controls.stop();
    };
  }, [value, inView, reduced, format]);
  return (
    <span ref={ref} className="tabular">
      {text}
    </span>
  );
}

/** Card that tilts up to 6° toward the cursor. */
export function TiltCard({ children, className, ...rest }: { children: ReactNode; className?: string } & JSX.IntrinsicElements['div']) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduced || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateX(${(-y * 12).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg) translateY(-3px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <div ref={ref} className={`tilt ${className ?? ''}`} onPointerMove={onMove} onPointerLeave={reset} {...rest}>
      {children}
    </div>
  );
}

/** Headline revealed word by word. */
export function WordReveal({ text, as: Tag = 'h1', id }: { text: string; as?: 'h1' | 'h2'; id?: string }) {
  const words = text.split(' ');
  return (
    <Tag id={id} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          aria-hidden="true"
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.base, ease: easeOut, delay: i * stagger * 1.5 }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </Tag>
  );
}

/** Rotates through words (ambient loop, paused with reduced motion). */
export function RotatingWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [reduced, words.length, interval]);
  return (
    <span className="rotating-word" aria-live="off">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[i]}
          style={{ display: 'inline-block' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: duration.base, ease: easeOut }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Small spring "pop" when a value changes (badges, counts). */
export function Pop({ children, k }: { children: ReactNode; k: string | number }) {
  return (
    <motion.span
      key={k}
      style={{ display: 'inline-block' }}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring}
    >
      {children}
    </motion.span>
  );
}

/**
 * 2D confetti on a canvas overlay (used when the 3D delivery scene is not shown).
 * 150 particles on desktop, 60 on mobile; nothing with reduced motion.
 */
export function Confetti2D({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const fmReduced = useFmReducedMotion();
  useEffect(() => {
    if (!fire || reduced || fmReduced) return;
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const count = window.innerWidth < 768 ? 60 : 150;
    const colors = ['#10B981', '#A7F3D0', '#3B82F6', '#F59E0B', '#065F46'];
    const parts = Array.from({ length: count }, () => ({
      x: c.width / 2 + (Math.random() - 0.5) * 120,
      y: c.height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.vy += 0.45;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2.4);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-4, -7, 8, 14);
        ctx.restore();
      }
      if (t < 2.4) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, reduced, fmReduced]);
  return <canvas ref={ref} className="confetti-2d" aria-hidden="true" data-testid="confetti" data-fired={fire} />;
}
