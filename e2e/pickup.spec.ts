import type { Browser } from '@playwright/test';
import { expect, test as base } from './fixtures';
import { loginWithDemo } from './helpers';

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.doctor', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  return ctx.newPage();
}

base('pickup: the patient shows a code and a QR code, the pharmacy opens the link, sees who it is for and confirms in one tap', async ({ page, browser }) => {
  await loginWithDemo(page, 'Alice — Tournon');
  await page.getByTestId('search-input').fill('Dafalgan');
  await page.getByTestId('search-input').press('Enter');
  await page.getByTestId('medicine-card').filter({ hasText: 'Dafalgan 500 mg' }).click();
  await page.getByTestId('pharmacy-row').filter({ hasText: 'Pharmacie du Rhône' }).getByRole('button', { name: 'Choisir cette pharmacie' }).click();
  await page.getByTestId('request-sheet').getByRole('button', { name: 'Envoyer la demande' }).click();
  await page.getByRole('link', { name: 'Suivre ma demande' }).click();

  const ph = await newPage(browser);
  await loginWithDemo(ph, 'Pharmacie du Rhône — Tournon', 'Pharmacie');
  const card = ph.getByTestId('incoming-request').filter({ hasText: 'Dafalgan' });
  await card.getByRole('button', { name: 'Accepter' }).click();
  await page.getByRole('link', { name: 'Voir la commande' }).click({ timeout: 20_000 });

  // The code and its QR code are on the order page from the moment it is accepted.
  const code = (await page.getByTestId('pickup-code-shown').innerText()).trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  await expect(page.getByTestId('pickup-card').getByRole('img', { name: 'QR code de retrait' })).toBeVisible();
  const orderUrl = page.url();
  const orderId = orderUrl.split('/orders/')[1].split(/[/?#]/)[0];

  // Pharmacy: prepare it, mark it ready, then use the link a phone camera would open.
  await ph.getByRole('tab', { name: /Commandes en cours/ }).click();
  const order = ph.getByTestId('pharmacy-order').filter({ hasText: 'Dafalgan' });
  for (const label of ['En préparation', 'Prête']) {
    await order.getByTestId('order-next').click();
    await expect(page.getByTestId('order-status')).toHaveText(label, { timeout: 20_000 });
  }
  await expect(order.getByTestId('pickup-link')).toBeVisible();
  await ph.goto(`/pickup/${orderId}.${code}`);
  const preview = ph.getByTestId('pickup-preview');
  await expect(preview).toContainText('Alice M.');
  await expect(preview).toContainText('Dafalgan');
  await ph.getByTestId('pickup-confirm').click();
  await expect(ph.getByTestId('pickup-done')).toBeVisible();

  // The patient's page now says delivered and the code is gone.
  await expect(page.getByTestId('order-status')).toHaveText('Livrée', { timeout: 20_000 });
  await expect(page.getByTestId('pickup-card')).toHaveCount(0);

  // A wrong code is refused with a clear message.
  await ph.goto(`/pickup/${orderId}.ZZZZZZ`);
  await expect(ph.getByTestId('pickup-preview')).toHaveCount(0);
  await expect(ph.getByText(/ne correspond/i)).toBeVisible();
});
