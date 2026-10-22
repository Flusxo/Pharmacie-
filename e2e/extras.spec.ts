import crypto from 'node:crypto';
import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

/** RFC 6238 code, computed here the way an authenticator app would. */
function totp(base32: string, stepOffset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of base32.replace(/\s/g, '')) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const mac = crypto.createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

test('a pharmacy turns on two-step verification, then needs a code to log in', async ({ page }) => {
  await loginWithDemo(page, 'Vienne', 'Pharmacie');
  await expect(page).toHaveURL(/\/pharmacy/);
  await page.goto('/profile');
  const section = page.getByTestId('two-step');
  await expect(section.getByText('Désactivée')).toBeVisible();
  await section.getByRole('button', { name: 'Configurer' }).click();
  await expect(section.getByRole('img', { name: /QR code/ })).toBeVisible();
  const secret = (await section.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await section.getByLabel('Code à 6 chiffres').fill(totp(secret));
  await section.getByRole('button', { name: 'Activer' }).click();
  await expect(section.getByText('Activée')).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await loginWithDemo(page, 'Vienne', 'Pharmacie');
  await expect(page.getByText('Ce compte utilise la validation en deux étapes.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  // The enabling code was used; the next step's code is accepted.
  await page.getByLabel('Code de l’application d’authentification').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/pharmacy/);
});

test('a new patient gets a 3-step tour pointing at search, map and requests, shown once', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('tour-test')) {
      localStorage.removeItem('counter.tour');
      sessionStorage.setItem('tour-test', '1');
    }
  });
  await loginWithDemo(page, 'Bruno — Valence');
  const tour = page.getByTestId('tour');
  await expect(tour.getByRole('heading', { name: 'Cherchez un médicament' })).toBeVisible();
  await expect(page.locator('[data-tour="search"].tour-target')).toBeVisible();
  await tour.getByRole('button', { name: 'Suivant' }).click();
  await expect(tour.getByRole('heading', { name: 'Voyez les pharmacies sur la carte' })).toBeVisible();
  await expect(page.locator('[data-tour="map"].tour-target')).toBeVisible();
  await tour.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.locator('[data-tour="requests"].tour-target')).toBeVisible();
  await tour.getByRole('button', { name: 'C’est parti' }).click();
  await expect(tour).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('patient and pharmacy can open a printable order slip; the pharmacy sees "First L." only', async ({ page, browser }) => {
  await loginWithDemo(page, 'Alice — Tournon');
  await expect(page).toHaveURL(/\/home$/);
  const alice = await apiAs('alice@pharmacie.test');
  const { items } = await alice.call<{ items: { id: string }[] }>('GET', '/patient/orders');
  await alice.ctx.dispose();
  await page.goto(`/orders/${items[0].id}/print`);
  const slip = page.getByTestId('order-slip');
  await expect(slip.getByRole('heading', { name: 'Bon de commande' })).toBeVisible();
  await expect(slip.getByText('Prototype : document de démonstration')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer' })).toBeVisible();

  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.addInitScript(() => localStorage.setItem('counter.graphics', 'off'));
  const ph = await ctx.newPage();
  await loginWithDemo(ph, 'Pharmacie du Rhône — Tournon', 'Pharmacie');
  await ph.getByRole('tab', { name: /Commandes en cours/ }).click();
  await ph.getByTestId('print-slip').first().click();
  const phSlip = ph.getByTestId('order-slip');
  await expect(phSlip.getByRole('heading', { name: 'Bon de commande' })).toBeVisible();
  const patient = await phSlip.locator('.slip-parties section').nth(1).locator('strong').innerText();
  expect(patient).toMatch(/^\S+ \S\.$/);
  await ctx.close();
});
