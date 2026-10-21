/**
 * Shared motion tokens. Every animation in the app uses these (framer-motion and CSS variables).
 * Animate only transform and opacity; every animation stays under 0.6 s except ambient loops.
 */
export const duration = {
  fast: 0.15,
  base: 0.3,
  slow: 0.6,
} as const;

/** One smooth ease-out (cubic-bezier) used everywhere. */
export const easeOut = [0.22, 1, 0.36, 1] as const;

/** One spring for playful UI (pins, badges, checkmarks). */
export const spring = { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 } as const;

/** Delay between items revealed in sequence. */
export const stagger = 0.06;

/** Page transition: fade, 12 px slide, slight blur. */
export const pageTransition = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: duration.base, ease: easeOut } },
  exit: { opacity: 0, y: -12, filter: 'blur(4px)', transition: { duration: duration.fast, ease: easeOut } },
} as const;

/** Scroll-reveal for lists and cards (once only). */
export const reveal = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: duration.base, ease: easeOut, delay: i * stagger } }),
} as const;

/** Button / card press feedback. */
export const press = { scale: 0.97 } as const;
export const lift = { y: -3 } as const;
