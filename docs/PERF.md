# Performance: measured, before and after (2026-10-23)

The hosted site felt slow on four devices. The cause was measured first, on the **production build** (not the dev server), in a real Chrome on this laptop (Intel UHD 620, the slow machine), then fixed. Nothing here is a guess: every number comes from `scripts/perf.mjs` (median of 3 runs, `scripts/perf-median.mjs`) or from Lighthouse.

## What was wrong (found with `scripts/cpu-profile.mjs` and `scripts/programs.mjs`)

1. **One freeze of 4 to 9 seconds** (the "Longest freeze" column) while the 3D started: three.js linked **27 shader programs** one after another, each 100-150 ms on an integrated GPU (ANGLE/Direct3D compiles at the first draw). The page could not be scrolled or clicked during that time.
2. Procedural textures rebuilt on every material (normal maps computed pixel by pixel on the CPU, label text measured hundreds of times), 4096 px labels everywhere, a 2 MB environment map decoded on start.
3. A 551 KB main script holding every page, a 1.15 MB 3D chunk loaded as soon as the page opened, post-processing code shipped to devices that never use it.
4. Start tier High on any strong-looking desktop; no dynamic resolution; page transitions animating a blur filter; no caching headers on the hosting; the sleeping free backend discovered only at the first click.

## What was done (details in docs/DECISIONS.md)

Shader programs 27 → 11 (plain standard materials on Medium, shared materials, one compile before the first frame, in parallel, without blocking); the 3D starts only after the page has loaded and the browser is idle; route-level code splitting (main script 551 → 272 KB) and a separate post-processing chunk; every device starts on Medium and climbs to High only on a strong desktop GPU after 90 s above 52 fps; dynamic resolution; instanced capsules and tablets; no CPU-built emboss maps and a half-size environment map outside High; cache headers; the backend is woken as the site opens; the pre-rendered hero still is preloaded and shown from the first frame.

## Numbers, before → **after** (median of 3 runs)

### This laptop (Intel UHD 620), no throttling, 1440 px

| Page     | First contentful paint (ms) | Largest contentful paint (ms) | Main-thread blocking (ms) | Longest freeze (ms) | 3D visible at (ms) | Frame rate (fps) | Layout shift      |
| -------- | --------------------------- | ----------------------------- | ------------------------- | ------------------- | ------------------ | ---------------- | ----------------- |
| home     | 488 → **216**               | 1000 → **1184**               | 7462 → **614**            | 6275 → **340**      | 8796 → **2725**    | 48 → **60.1**    | 0.001 → **0.001** |
| login    | 528 → **152**               | 796 → **1064**                | 5000 → **365**            | 4183 → **388**      | 6321 → **1827**    | 56.8 → **60.1**  | 0.002 → **0.002** |
| search   | 404 → **356**               | 596 → **468**                 | 1740 → **101**            | 919 → **114**       | 2958 → **1269**    | 60.1 → **60.2**  | 0.001 → **0.039** |
| medicine | 328 → **312**               | 1476 → **376**                | 2885 → **553**            | 883 → **289**       | 3086 → **1062**    | 59.4 → **60.1**  | 0.138 → **0.216** |

JavaScript transferred on the first page: 504 KB → **410 KB** (compressed).

### Phone profile: 390 px, CPU x4 slower, slow 4G

| Page     | First contentful paint (ms) | Largest contentful paint (ms) | Main-thread blocking (ms) | Longest freeze (ms) | 3D visible at (ms) | Frame rate (fps) | Layout shift      |
| -------- | --------------------------- | ----------------------------- | ------------------------- | ------------------- | ------------------ | ---------------- | ----------------- |
| home     | 2984 → **1908**             | 3748 → **3532**               | 11985 → **2993**          | 8436 → **1184**     | 18390 → **8759**   | 34.5 → **60.1**  | 0.001 → **0.001** |
| login    | 2496 → **1868**             | 3072 → **3044**               | 10404 → **2493**          | 5720 → **1996**     | 16191 → **7761**   | 46.3 → **60.2**  | 0.001 → **0.001** |
| search   | 2664 → **2468**             | 3192 → **2872**               | 5223 → **1020**           | 3720 → **498**      | 11082 → **6103**   | 60.1 → **60.1**  | 0 → **0**         |
| medicine | 2364 → **2456**             | 2788 → **2908**               | 5361 → **2722**           | 3409 → **1765**     | 11012 → **8194**   | 60 → **60.2**    | 0.04 → **0.04**   |

JavaScript transferred on the first page: 504 KB → **410 KB** (compressed).

"Main-thread blocking" is the total time the page was unresponsive after the first paint. "Frame rate" is requestAnimationFrame over 6 s once the 3D runs (60 is the screen's maximum; before, the home page ran at 48 and the phone profile at 34). The phone profile is an **emulation on this laptop** (CPU 4x slower, slow 4G: 1.6 Mbit/s, 150 ms), not a real phone.

### With the live 3D off (Graphics: Low), after

### This laptop (Intel UHD 620), no throttling, 1440 px

| Page     | First contentful paint (ms) | Largest contentful paint (ms) | Main-thread blocking (ms) | Longest freeze (ms) | 3D visible at (ms) | Frame rate (fps) | Layout shift      |
| -------- | --------------------------- | ----------------------------- | ------------------------- | ------------------- | ------------------ | ---------------- | ----------------- |
| home     | 488 → **384**               | 1000 → **1356**               | 7462 → **271**            | 6275 → **228**      | 8796 → **0**       | 48 → **60.1**    | 0.001 → **0.001** |
| login    | 528 → **356**               | 796 → **1104**                | 5000 → **28**             | 4183 → **78**       | 6321 → **0**       | 56.8 → **60.3**  | 0.002 → **0.002** |
| search   | 404 → **584**               | 596 → **832**                 | 1740 → **0**              | 919 → **104**       | 2958 → **0**       | 60.1 → **60.3**  | 0.001 → **0.039** |
| medicine | 328 → **704**               | 1476 → **864**                | 2885 → **17**             | 883 → **89**        | 3086 → **0**       | 59.4 → **60.2**  | 0.138 → **0.039** |

JavaScript transferred on the first page: 504 KB → **205 KB** (compressed).

### Phone profile: 390 px, CPU x4 slower, slow 4G

| Page     | First contentful paint (ms) | Largest contentful paint (ms) | Main-thread blocking (ms) | Longest freeze (ms) | 3D visible at (ms) | Frame rate (fps) | Layout shift      |
| -------- | --------------------------- | ----------------------------- | ------------------------- | ------------------- | ------------------ | ---------------- | ----------------- |
| home     | 2984 → **2204**             | 3748 → **4752**               | 11985 → **2042**          | 8436 → **1501**     | 18390 → **0**      | 34.5 → **59.9**  | 0.001 → **0.001** |
| login    | 2496 → **2404**             | 3072 → **4912**               | 10404 → **966**           | 5720 → **675**      | 16191 → **0**      | 46.3 → **60.3**  | 0.001 → **0.001** |
| search   | 2664 → **3372**             | 3192 → **4064**               | 5223 → **361**            | 3720 → **343**      | 11082 → **0**      | 60.1 → **60.3**  | 0 → **0**         |
| medicine | 2364 → **3076**             | 2788 → **4068**               | 5361 → **1426**           | 3409 → **411**      | 11012 → **0**      | 60 → **56.3**    | 0.04 → **0.166**  |

JavaScript transferred on the first page: 504 KB → **205 KB** (compressed).

The floor is the app itself (React, 272 KB of script): without 3D the laptop blocks at most 0.3 s, a 4x slower phone about 1-2 s.

### Lighthouse 12 (performance only), production build

| Run           | Score | FCP   | LCP   | TBT      | CLS   |
| ------------- | ----- | ----- | ----- | -------- | ----- |
| home-desktop  | 67    | 0.6 s | 1.0 s | 980 ms   | 0.003 |
| home-mobile   | 49    | 2.6 s | 4.5 s | 3,890 ms | 0.002 |
| login-desktop | 69    | 0.6 s | 0.9 s | 940 ms   | 0     |
| login-mobile  | 51    | 2.7 s | 4.4 s | 3,040 ms | 0     |

## Targets and what is honestly reached

| Target                                       | Result                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First content under 2 s on a good connection | **Yes**: first paint 0.15-0.36 s on the laptop; largest paint about 1.1 s. On the throttled phone profile first paint is 1.9-2.5 s: **not** under 2 s on slow 4G with a 4x slower CPU.                                                                                                                                                                                    |
| At least 45 fps on Medium on the slow laptop | **Yes**: 60 fps on every measured page (it was 48 on the home page).                                                                                                                                                                                                                                                                                                      |
| At least 30 fps on a mid phone               | **Yes in emulation** (60 fps with the phone profile); **not verified on a real phone**.                                                                                                                                                                                                                                                                                   |
| No layout shift                              | Final median of 3: laptop 0 to 0.009 on every page; phone profile 0 to 0.04. The footer jump on the medicine page is fixed (the main area fills the screen). |
| Never block clicks or scrolling on 3D        | **Not fully met on slow CPUs.** On the laptop the longest freeze is 0.1-0.45 s (was 4-6 s). On the 4x slower phone it is still 0.5-2 s while the 3D chunk is parsed and the scene is built (it was 3-8 s). Splitting that chunk further or building the scene in slices would reduce it; it was not done. The Lighthouse mobile score (49-51) is limited by exactly this. |

## Hosted site

The numbers above are for the production build served locally with brotli and the same cache rules as `frontend/public/_headers`. They do not include the CDN or the time the free Render backend needs to wake (up to a minute after a pause: the site now wakes it as it opens and shows the banner after 1.5 s).

## Reproduce

```bash
npm run build
node scripts/serve-prod.mjs            # production build on :4173 (API proxied to :4000)
node scripts/perf-median.mjs mytag laptop 3
node scripts/perf-median.mjs mytag phone 3
node scripts/perf-report.mjs mytag     # markdown table against the "before" files in docs/perf
node scripts/programs.mjs ""           # shader programs, draw calls, triangles of a page
node scripts/cpu-profile.mjs "" 12     # where the main-thread time goes (THROTTLE=4 for a slow CPU)
```
