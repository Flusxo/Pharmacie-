/**
 * Fits a medicine name + dosage inside a label box: wraps the name on at most 3 lines and the dosage on
 * at most 2, and shrinks both until every line is narrower than the box and the block is shorter than it.
 * Text is never cropped or cut: the result always fits (the font gets smaller instead).
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FittedLine {
  text: string;
  /** Baseline, in the box's units. */
  y: number;
  size: number;
  weight: 700 | 600;
}
export type Measure = (text: string, size: number, weight: number) => number;

const FONT = 'Inter Variable, Inter, system-ui, sans-serif';

/** Conservative width estimate for Inter (slightly wider than the real glyphs, so it never under-measures). */
export const estimateWidth: Measure = (text, size, weight) => {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if ("iljI.,;:!|'’".includes(ch)) em += 0.3;
    else if ('frt()/-'.includes(ch)) em += 0.4;
    else if ('mwMW%'.includes(ch)) em += 0.9;
    else if (/[0-9]/.test(ch)) em += 0.62;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += 0.72;
    else em += 0.6;
  }
  return em * size * (weight >= 700 ? 1.06 : 1);
};

const interLoaded = (weight: number) => {
  try {
    return (
      typeof document !== 'undefined' && !!document.fonts?.check(`${weight} 12px "Inter Variable"`) && document.fonts.status === 'loaded'
    );
  } catch {
    return false;
  }
};

let ctx: OffscreenCanvasRenderingContext2D | null | undefined;
/**
 * Real browser measurement (+4 % margin) once Inter is loaded; until then (and outside a browser) the
 * conservative estimate, so a label drawn before the font arrives is smaller, never overflowing.
 */
export const measureText: Measure = (text, size, weight) => {
  const est = estimateWidth(text, size, weight);
  if (ctx === undefined) {
    try {
      ctx = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
    } catch {
      ctx = null;
    }
  }
  if (!ctx || !interLoaded(weight)) return est;
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(text).width * 1.04;
};

/** Greedy wrap; returns null when a single word is wider than the box or more than maxLines are needed. */
function wrap(words: string[], size: number, weight: number, width: number, maxLines: number, measure: Measure): string[] | null {
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (measure(w, size, weight) > width) return null;
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size, weight) <= width) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out.length <= maxLines ? out : null;
}

// A line occupies 0.96 em above the baseline (accented capitals like "É") and 0.24 em below it.
const LINE = 1.2;
const ASCENT = 0.96;

export function fitLabel(
  title: string,
  dosage: string,
  box: Box,
  { maxTitle = 18, maxDose = 13, measure = measureText }: { maxTitle?: number; maxDose?: number; measure?: Measure } = {},
): FittedLine[] {
  const tWords = title.trim().split(/\s+/).filter(Boolean);
  const dWords = dosage.trim() ? dosage.trim().split(/\s+/) : [];
  for (let size = maxTitle; size >= 3; size -= 0.5) {
    const tLines = wrap(tWords, size, 700, box.w, 3, measure);
    if (!tLines) continue;
    const dSize = Math.min(maxDose, Math.max(size * 0.82, Math.min(7.5, size)));
    const dLines = dWords.length ? wrap(dWords, dSize, 600, box.w, 2, measure) : [];
    if (!dLines) continue;
    const gap = dLines.length ? dSize * 0.45 : 0;
    const height = tLines.length * size * LINE + gap + dLines.length * dSize * LINE;
    if (height > box.h) continue;
    let top = box.y + (box.h - height) / 2;
    const out: FittedLine[] = [];
    for (const t of tLines) {
      out.push({ text: t, y: top + size * ASCENT, size, weight: 700 });
      top += size * LINE;
    }
    top += gap;
    for (const d of dLines) {
      out.push({ text: d, y: top + dSize * ASCENT, size: dSize, weight: 600 });
      top += dSize * LINE;
    }
    return out;
  }
  // Unreachable for real names; still never draws outside the box.
  return [];
}

/** The name printed on the pack: the trailing dosage is dropped (it is printed on its own line). */
export const packTitle = (name: string) => name.replace(/\s+\d[\d\s,.]*\s*(mg|g|µg|ml|UI|U|%).*$/i, '').trim() || name;
