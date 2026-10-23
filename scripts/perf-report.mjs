// Markdown table "before / after" from docs/perf/<before|tag>-<profile>.json (written by scripts/perf.mjs).
// usage: node scripts/perf-report.mjs <afterTag>
import { readFileSync, existsSync } from 'node:fs';

const after = process.argv[2] ?? 'final';
const cols = [
  ['fcp', 'First contentful paint (ms)'],
  ['lcp', 'Largest contentful paint (ms)'],
  ['tbt', 'Main-thread blocking (ms)'],
  ['maxLong', 'Longest freeze (ms)'],
  ['stage3dAt', '3D visible at (ms)'],
  ['fps', 'Frame rate (fps)'],
  ['cls', 'Layout shift'],
];
const read = (tag, profile) => {
  const f = `docs/perf/${tag}-${profile}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
};
const val = (row, k) => (k === 'maxLong' ? Math.max(0, ...row.longList.map((x) => x[1])) : row[k]);
let out = '';
for (const profile of ['laptop', 'phone']) {
  const b = read('before', profile);
  const a = read(after, profile);
  out += `\n### ${profile === 'laptop' ? 'This laptop (Intel UHD 620), no throttling, 1440 px' : 'Phone profile: 390 px, CPU x4 slower, slow 4G'}\n\n`;
  out += `| Page | ${cols.map(([, n]) => n).join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|\n`;
  for (const row of a) {
    const prev = b.find((x) => x.page === row.page);
    out += `| ${row.page} | ${cols.map(([k]) => `${prev ? val(prev, k) : '–'} → **${val(row, k)}**`).join(' | ')} |\n`;
  }
  const jsb = b[0]?.kb.js;
  const jsa = a[0]?.kb.js;
  out += `\nJavaScript transferred on the first page: ${jsb} KB → **${jsa} KB** (compressed).\n`;
}
console.log(out);
