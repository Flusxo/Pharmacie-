import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/settings';

/**
 * A soft light that follows the mouse (mouse only, off with "Reduce animations"), and the press point for the button
 * ripple (CSS in styles/polish.css reads --rx / --ry).
 */
export function CursorGlow() {
  const el = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>('.btn');
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty('--rx', `${e.clientX - r.left}px`);
      b.style.setProperty('--ry', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    if (reduced) return () => document.removeEventListener('pointerdown', onDown);
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !el.current) return;
      x = e.clientX;
      y = e.clientY;
      el.current.classList.add('on');
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (el.current) el.current.style.transform = `translate(${x}px, ${y}px)`;
        });
    };
    const onLeave = () => el.current?.classList.remove('on');
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);
  return reduced ? null : <div ref={el} className="cursor-glow" aria-hidden="true" />;
}
