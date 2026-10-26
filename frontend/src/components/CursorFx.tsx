import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useGraphics } from '../lib/graphics';
import { useReducedMotion } from '../lib/settings';

/**
 * Cursor effects, cheap by construction:
 *  - ONE pointermove listener and ONE requestAnimationFrame loop for everything; the loop sleeps when nothing moves and
 *    stops when the tab is hidden.
 *  - Only transform and opacity change (no layout, no repaint of text): a soft glow that trails the pointer and grows over
 *    buttons, links and panels, three fading dots behind it, a "spotlight" on headline letters and key words
 *    (they lift 3 px and an accent copy fades in over them), and a small magnetic pull on the button or link under the pointer.
 *  - Off on touch devices, on the Low and Off graphics tiers, with "Reduce animations" or prefers-reduced-motion, in a hidden
 *    tab, and while the pointer is inside a form field or label.
 * The button ripple (pressed point) is kept here too because it needs the same pointer position.
 */
const INTERACTIVE = 'a, button, [role="button"], [role="tab"], summary, .glass, .card';
const MAGNET = '.btn, .pub-nav a, .pub-menu a, .topbar nav a, .tab-btn, .link-arrow';
const FIELD = 'input, textarea, select, [contenteditable="true"], label';
const SPOT_R = 130; // letters this close (px) react
const WORD_R = 170;

interface Spot {
  el: HTMLElement;
  x: number;
  y: number;
  p: number;
}
interface Group {
  el: HTMLElement;
  rect: DOMRect;
  letters: Spot[];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function CursorFx() {
  const reduced = useReducedMotion();
  const { tier } = useGraphics();
  const { pathname } = useLocation();
  const layer = useRef<HTMLDivElement>(null);
  const dirty = useRef(true);
  const on = !reduced && tier !== 'low' && tier !== 'off';

  // The pressed point for the button ripple (CSS reads --rx / --ry).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>('.btn');
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty('--rx', `${e.clientX - r.left}px`);
      b.style.setProperty('--ry', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  // A new page has new headlines: measure again.
  useEffect(() => {
    dirty.current = true;
  }, [pathname]);

  useEffect(() => {
    const host = layer.current;
    if (!on || !host || !window.matchMedia('(pointer: fine)').matches) return;
    const glow = host.querySelector<HTMLElement>('.fx-glow')!;
    const dots = [...host.querySelectorAll<HTMLElement>('.fx-dot')];

    const pointer = { x: -999, y: -999, over: null as Element | null, pressed: false, seen: false };
    const g = { x: -999, y: -999, s: 1, a: 0 };
    const trail = dots.map(() => ({ x: -999, y: -999 }));
    let groups: Group[] = [];
    let words: Spot[] = [];
    let magnetEl: HTMLElement | null = null;
    let magnetRect: DOMRect | null = null;
    let raf = 0;
    let alive = true;

    const measure = () => {
      dirty.current = false;
      groups = [...document.querySelectorAll<HTMLElement>('[data-fx="letters"]')].map((el) => ({
        el,
        rect: el.getBoundingClientRect(),
        letters: [...el.querySelectorAll<HTMLElement>('.fx-l')].map((l) => {
          const r = l.getBoundingClientRect();
          return { el: l, x: r.left + r.width / 2, y: r.top + r.height / 2, p: 0 };
        }),
      }));
      words = [...document.querySelectorAll<HTMLElement>('[data-fx="word"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.left + r.width / 2, y: r.top + r.height / 2, p: 0 };
      });
    };
    const markDirty = () => {
      dirty.current = true;
      wake();
    };

    const release = () => {
      if (magnetEl) {
        magnetEl.style.transform = '';
        magnetEl.style.setProperty('--g', '0');
        magnetEl.classList.remove('fx-magnet');
      }
      magnetEl = null;
      magnetRect = null;
    };

    const frame = () => {
      raf = 0;
      if (!alive || document.hidden) return;
      if (dirty.current) measure();
      const inField = !!pointer.over?.closest(FIELD);
      const visible = pointer.seen && !inField;

      // Glow: eased toward the pointer, bigger over things you can click.
      const hot = visible && !!pointer.over?.closest(INTERACTIVE);
      g.x += (pointer.x - g.x) * 0.16;
      g.y += (pointer.y - g.y) * 0.16;
      g.s += ((hot ? 1.35 : 1) - g.s) * 0.14;
      g.a += ((visible ? 1 : 0) - g.a) * 0.18;
      glow.style.transform = `translate3d(${g.x}px, ${g.y}px, 0) scale(${g.s.toFixed(3)})`;
      glow.style.opacity = (g.a * (hot ? 0.95 : 0.75)).toFixed(3);
      let prev: { x: number; y: number } = g;
      let moving = Math.abs(pointer.x - g.x) + Math.abs(pointer.y - g.y) > 0.4 || Math.abs(g.a - (visible ? 1 : 0)) > 0.01;
      dots.forEach((d, i) => {
        const t = trail[i];
        const k = 0.2 - i * 0.05;
        t.x += (prev.x - t.x) * k;
        t.y += (prev.y - t.y) * k;
        d.style.transform = `translate3d(${t.x}px, ${t.y}px, 0)`;
        d.style.opacity = (g.a * (0.5 - i * 0.14)).toFixed(3);
        if (Math.abs(prev.x - t.x) + Math.abs(prev.y - t.y) > 0.4) moving = true;
        prev = t;
      });

      // Headlines and key words: letters near the pointer lift and brighten, the rest settle back.
      for (const grp of groups) {
        const near =
          visible &&
          pointer.x > grp.rect.left - SPOT_R &&
          pointer.x < grp.rect.right + SPOT_R &&
          pointer.y > grp.rect.top - SPOT_R &&
          pointer.y < grp.rect.bottom + SPOT_R;
        for (const l of grp.letters) {
          const target = near ? Math.pow(clamp(1 - Math.hypot(pointer.x - l.x, pointer.y - l.y) / SPOT_R, 0, 1), 1.4) : 0;
          if (Math.abs(target - l.p) < 0.01 && target === 0) continue;
          l.p += (target - l.p) * 0.28;
          if (l.p < 0.01) l.p = 0;
          l.el.style.setProperty('--p', l.p.toFixed(2));
          if (l.p > 0) moving = true;
        }
      }
      for (const w of words) {
        const target = visible ? Math.pow(clamp(1 - Math.hypot(pointer.x - w.x, pointer.y - w.y) / WORD_R, 0, 1), 1.2) : 0;
        if (target === 0 && w.p === 0) continue;
        w.p += (target - w.p) * 0.25;
        if (w.p < 0.01) w.p = 0;
        w.el.style.setProperty('--p', w.p.toFixed(2));
        if (w.p > 0) moving = true;
      }

      // Magnetic pull on the button or link under the pointer (a few pixels, released with a short transition).
      const want = visible && !pointer.pressed ? (pointer.over?.closest<HTMLElement>(MAGNET) ?? null) : null;
      if (want !== magnetEl) {
        release();
        if (want) {
          magnetEl = want;
          magnetRect = want.getBoundingClientRect();
          want.classList.add('fx-magnet');
        }
      }
      if (magnetEl && magnetRect) {
        const cx = magnetRect.left + magnetRect.width / 2;
        const cy = magnetRect.top + magnetRect.height / 2;
        const dx = clamp((pointer.x - cx) * 0.18, -7, 7);
        const dy = clamp((pointer.y - cy) * 0.22, -5, 5);
        magnetEl.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
        magnetEl.style.setProperty('--g', '1');
        magnetEl.style.setProperty('--rx', `${pointer.x - magnetRect.left}px`);
        magnetEl.style.setProperty('--ry', `${pointer.y - magnetRect.top}px`);
      }

      if (moving || magnetEl) raf = requestAnimationFrame(frame);
    };
    function wake() {
      if (!raf && alive && !document.hidden) raf = requestAnimationFrame(frame);
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.over = e.target as Element | null;
      pointer.pressed = e.buttons !== 0;
      if (!pointer.seen) {
        pointer.seen = true;
        g.x = e.clientX;
        g.y = e.clientY;
        trail.forEach((t) => ((t.x = e.clientX), (t.y = e.clientY)));
      }
      wake();
    };
    const onLeave = () => {
      pointer.seen = false;
      pointer.over = null;
      wake();
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else wake();
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', markDirty, { passive: true });
    window.addEventListener('resize', markDirty);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      release();
      groups.forEach((gr) => gr.letters.forEach((l) => l.el.style.removeProperty('--p')));
      words.forEach((w) => w.el.style.removeProperty('--p'));
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', markDirty);
      window.removeEventListener('resize', markDirty);
    };
  }, [on]);

  if (!on) return null;
  return (
    <div ref={layer} className="fx-layer" aria-hidden="true" data-testid="cursor-fx">
      <i className="fx-glow" />
      <i className="fx-dot" />
      <i className="fx-dot" />
      <i className="fx-dot" />
    </div>
  );
}
