import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { apiAs, loginByToken } from './helpers';

/**
 * Screenshots of the screens added with private files, messages, reviews, time slots and moderation, at 1440, 768 and
 * 390 px, light and dark, French and English. Runs only on demand, on the isolated e2e database (nothing touches Neon):
 *   SHOTS=1 npm run e2e -- e2e/new-screens.spec.ts      ->  docs/screenshots/new-b/<lang>-<scheme>/<width>-<screen>.jpg
 */
test.skip(!process.env.SHOTS, 'screenshots are made on demand (SHOTS=1)');
test.setTimeout(30 * 60_000);
// A step that does not apply to a screen must fail fast (the screenshot is still taken).
test.use({ actionTimeout: 5000 });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]);
const EMAILS = ['emma@pharmacie.test', 'bruno@pharmacie.test', 'david@pharmacie.test', 'pharmacie.tournon@pharmacie.test', 'pharmacie.demo@pharmacie.test', 'admin@pharmacie.test'];

async function makeOrder(patientEmail: string, upTo: 'request' | 'accepted' | 'delivered') {
  const patient = await apiAs(patientEmail);
  const tournon = await apiAs('pharmacie.tournon@pharmacie.test');
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  const meds = await patient.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await patient.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  await patient.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });
  if (upTo === 'request') return { requestId: req.id, patient, tournon };
  const { orderId } = await tournon.call<{ orderId: string }>('POST', `/pharmacy/requests/${req.id}/accept`);
  if (upTo === 'delivered') {
    for (const status of ['preparing', 'ready']) await tournon.call('PATCH', `/pharmacy/orders/${orderId}/status`, { status, prescriptionChecked: true });
    const o = await patient.call<{ order: { pickupCode: string } }>('GET', `/patient/orders/${orderId}`);
    await tournon.call('POST', `/pharmacy/orders/${orderId}/pickup`, { code: o.order.pickupCode });
  }
  return { requestId: req.id, orderId, patient, tournon };
}

test('screenshots of the new screens', async ({ browser }) => {
  // Data: a request with a prescription file waiting at the pharmacy; an accepted order with a time and messages;
  // a delivered order with a review and a reported message; an applicant's document.
  const waiting = await makeOrder('bruno@pharmacie.test', 'request');
  const png = (name: string) => ({ method: 'POST', data: PNG, headers: { 'Content-Type': 'image/png', 'X-Filename': name } });
  void png;
  const API = 'http://localhost:4100/api';
  const upload = async (email: string, p: string, name: string) => {
    const { ctx } = await apiAs(email);
    const login = await ctx.post(`${API}/auth/login`, { data: { email, password: 'Password123!' } });
    const { token } = (await login.json()) as { token: string };
    await ctx.post(`${API}${p}`, { data: PNG, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', 'X-Filename': name } });
  };
  await upload('bruno@pharmacie.test', `/patient/requests/${waiting.requestId}/files`, 'ordonnance.png');
  await upload('pharmacie.demo@pharmacie.test', '/me/verification-files', 'autorisation.png');

  const accepted = await makeOrder('emma@pharmacie.test', 'accepted');
  await accepted.tournon.call('PATCH', '/pharmacy/profile', { services: ['vaccination'], languages: ['fr'], accessibility: [] });
  const offer = await accepted.patient.call<{ slots: string[] }>('GET', `/patient/orders/${accepted.orderId}/slots`);
  if (offer.slots[4]) await accepted.patient.call('PUT', `/patient/orders/${accepted.orderId}/slot`, { start: offer.slots[4], mode: 'pickup' });
  await accepted.patient.call('POST', `/patient/orders/${accepted.orderId}/messages`, { body: 'Bonjour, je passe en fin de journée.' });
  await accepted.tournon.call('POST', `/pharmacy/orders/${accepted.orderId}/messages`, { body: 'Très bien, votre commande sera prête.' });
  const thread = await accepted.patient.call<{ items: { id: number; senderRole: string }[] }>('GET', `/patient/orders/${accepted.orderId}/messages`);
  const theirs = thread.items.find((m) => m.senderRole === 'pharmacy')!;
  await accepted.patient.call('POST', `/patient/messages/${theirs.id}/report`, { reason: 'Hors sujet' });

  const delivered = await makeOrder('david@pharmacie.test', 'delivered');
  await delivered.patient.call('POST', `/patient/orders/${delivered.orderId}/review`, { rating: 5, comment: 'Retrait rapide, équipe aimable.' });
  const tournonId = (await accepted.tournon.call<{ user: { id: string } }>('GET', '/auth/me')).user.id;
  const pendingApplicant = (await (await apiAs('pharmacie.demo@pharmacie.test')).call<{ user: { id: string } }>('GET', '/auth/me')).user.id;
  void pendingApplicant;

  const screens: { name: string; email: string | null; path: string; before?: (p: import('@playwright/test').Page, lang: string) => Promise<void> }[] = [
    { name: 'rx-patient', email: 'bruno@pharmacie.test', path: `/requests/${waiting.requestId}` },
    {
      name: 'rx-pharmacy',
      email: 'pharmacie.tournon@pharmacie.test',
      path: '/pharmacy',
      before: async (p) => {
        const d = p.getByText(/Ordonnance jointe par le patient|Prescription attached by the patient/).first();
        await d.click();
        await p.getByRole('button', { name: /^(Voir|View)$/ }).first().click();
        await p.waitForTimeout(800);
      },
    },
    { name: 'verification-waiting', email: 'pharmacie.demo@pharmacie.test', path: '/waiting' },
    { name: 'order-slot-messages', email: 'emma@pharmacie.test', path: `/orders/${accepted.orderId}` },
    { name: 'order-review', email: 'david@pharmacie.test', path: `/orders/${delivered.orderId}` },
    { name: 'pharmacy-reviews-public', email: null, path: `/pharmacies/${tournonId}` },
    {
      name: 'staff-verification-checklist',
      email: 'admin@pharmacie.test',
      path: '/admin',
      before: async (p) => {
        await p.getByText(/Justificatifs envoyés|Documents sent/).first().click();
        await p.waitForTimeout(500);
      },
    },
    {
      name: 'staff-moderation',
      email: 'admin@pharmacie.test',
      path: '/admin',
      before: async (p, lang) => {
        await p.getByRole('tab', { name: lang === 'fr' ? /Signalements/ : /Reports/ }).click();
        await p.waitForTimeout(800);
      },
    },
  ];

  for (const lang of ['fr', 'en'] as const) {
    for (const email of EMAILS) await (await apiAs(email)).call('PATCH', '/auth/me/preferences', { language: lang });
    for (const scheme of ['light', 'dark'] as const) {
      const dir = path.join(process.cwd(), 'docs', 'screenshots', 'new-b', `${lang}-${scheme}`);
      mkdirSync(dir, { recursive: true });
      for (const width of [1440, 768, 390]) {
        for (const s of screens) {
          const ctx = await browser.newContext({
            baseURL: 'http://localhost:5174',
            viewport: { width, height: width < 500 ? 800 : width < 1000 ? 1024 : 900 },
            colorScheme: scheme,
            locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
            timezoneId: 'Europe/Paris',
          });
          await ctx.addInitScript(
            ([th, lg]) => {
              localStorage.setItem('counter.theme', th);
              localStorage.setItem('counter.lang', lg);
              localStorage.setItem('counter.graphics', 'off');
              localStorage.setItem('counter.tour', 'done');
              localStorage.setItem('counter.tour.doctor', 'done');
              localStorage.setItem('counter.tour.pharmacy', 'done');
              localStorage.setItem('counter.consent', 'essential');
            },
            [scheme, lang],
          );
          const page = await ctx.newPage();
          if (s.email) await loginByToken(page, s.email);
          await page.goto(s.path);
          await page.waitForTimeout(1800);
          if (s.before) await s.before(page, lang).catch(() => {});
          await page.waitForTimeout(500);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 1) console.log(`OVERFLOW ${lang} ${scheme} ${width} ${s.name}: ${overflow}px`);
          await page.screenshot({ path: path.join(dir, `${width}-${s.name}.jpg`), type: 'jpeg', quality: 72, fullPage: true });
          await ctx.close();
        }
      }
    }
  }
});
