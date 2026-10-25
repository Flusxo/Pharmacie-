// Checks a Lighthouse JSON report against the thresholds. A regression gate, not a quality claim: the mobile score is
// limited by the 3D start on slow CPUs (see docs/PERF.md), so the bar is set under today's measured values.
// usage: node scripts/lighthouse-check.mjs <report.json> [mobile|desktop]
import { readFileSync } from 'node:fs';

const [, , file, form = 'mobile'] = process.argv;
if (!file) {
  console.error('usage: node scripts/lighthouse-check.mjs <report.json> [mobile|desktop]');
  process.exit(2);
}
const j = JSON.parse(readFileSync(file, 'utf8'));
const T = form === 'desktop' ? { score: 0.5, cls: 0.1, lcp: 2500 } : { score: 0.25, cls: 0.1, lcp: 7000 };
const got = {
  score: j.categories.performance.score,
  cls: j.audits['cumulative-layout-shift'].numericValue,
  lcp: j.audits['largest-contentful-paint'].numericValue,
};
const rows = [
  ['performance score', got.score, `>= ${T.score}`, got.score >= T.score],
  ['layout shift (CLS)', got.cls, `<= ${T.cls}`, got.cls <= T.cls],
  ['largest contentful paint (ms)', Math.round(got.lcp), `<= ${T.lcp}`, got.lcp <= T.lcp],
];
for (const [n, v, rule, ok] of rows) console.log(`${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(32)} ${String(v).padStart(7)}  (${rule})`);
process.exit(rows.every((r) => r[3]) ? 0 : 1);
