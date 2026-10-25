// Screenshots of the Part B additions (filters, disclaimer, verified badge, legal notice). Dev server on :5173, API :4000.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = 'docs/screenshots/partb';
mkdirSync(out, { recursive: true });
const r = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'alice@pharmacie.test', password: 'Password123!' }),
});
const token = (await r.json()).token;
const b = await chromium.launch();
for (const [w, h, name] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((tk) => {
    localStorage.setItem('counter.token', tk);
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.doctor', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
    localStorage.setItem('counter.consent', 'essential');
    localStorage.setItem('counter.graphics', 'off');
  }, token);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/search?q=Doliprane');
  await p.getByTestId('medicine-card').first().click();
  await p.getByTestId('pharmacy-row').first().waitFor({ timeout: 30000 });
  await p.getByTestId('pharmacy-row').first().scrollIntoViewIfNeeded();
  await p.getByText(/Open now|Ouvertes maintenant/).first().click();
  await p.waitForTimeout(500);
  console.log(name, 'rows with open filter:', await p.getByTestId('pharmacy-row').count());
  await p.screenshot({ path: `${out}/medicine-filters-${name}.png` });
  await p.goto('http://localhost:5173/legal');
  await p.waitForTimeout(1500);
  console.log(name, 'legal h2:', await p.locator('h2').count());
  await p.screenshot({ path: `${out}/legal-${name}.png` });
  await ctx.close();
}
await b.close();
