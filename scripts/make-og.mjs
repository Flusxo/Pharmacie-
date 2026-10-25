// Share image (1200x630) for link previews, drawn from the brand colours and the wordmark; no logo of anyone else.
// usage: node scripts/make-og.mjs   -> frontend/public/og.png
import { chromium } from '@playwright/test';

const html = `<body style="margin:0;width:1200px;height:630px;display:grid;place-items:center;background:linear-gradient(135deg,#065F46,#0f766e 55%,#34d399);font-family:Georgia,'Times New Roman',serif;color:#fff">
<div style="text-align:left;padding:0 90px">
  <div style="font-size:150px;font-weight:700;letter-spacing:-3px">counter<span style="color:#a7f3d0">.</span></div>
  <div style="font-size:50px;margin-top:10px;line-height:1.2">Your medicine, at the pharmacy of your choice.</div>
  <div style="font-family:Arial,sans-serif;font-size:28px;margin-top:34px;opacity:.85">Prototype. Not for real medical use. Demo data.</div>
</div></body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: 'frontend/public/og.png' });
await b.close();
