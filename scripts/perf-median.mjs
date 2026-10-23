// Runs scripts/perf.mjs several times and keeps the MEDIAN of every number per page (one run is noisy).
// usage: node scripts/perf-median.mjs <tag> <profile> [runs] [base]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const [, , tag, profile = 'laptop', runsArg = '3', base = 'http://localhost:4173'] = process.argv;
const runs = Number(runsArg);
const all = [];
for (let i = 0; i < runs; i++) {
  const out = execFileSync('node', ['scripts/perf.mjs', `${tag}-run${i}`, profile, '', base], { encoding: 'utf8', maxBuffer: 1 << 26 });
  all.push(
    out
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l)),
  );
}
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const rows = all[0].map((_, p) => {
  const col = all.map((r) => r[p]);
  const num = (f) => med(col.map(f));
  return {
    page: col[0].page,
    profile,
    runs,
    fcp: num((r) => r.fcp),
    lcp: num((r) => r.lcp),
    tbt: num((r) => r.tbt),
    cls: num((r) => r.cls),
    stage3dAt: num((r) => r.stage3dAt),
    fps: num((r) => r.fps),
    longList: [[0, num((r) => Math.max(0, ...r.longList.map((x) => x[1])))]],
    kb: col[0].kb,
  };
});
mkdirSync('docs/perf', { recursive: true });
writeFileSync(`docs/perf/${tag}-${profile}.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows.map((r) => [r.page, r.fcp, r.lcp, r.tbt])));
