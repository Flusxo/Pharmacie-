import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('family: a patient adds a child, sends a request for them, and the pharmacy sees "for Léa (child)" next to the account holder’s First L.', async ({ page, browser }) => {
  await loginWithDemo(page, 'Camille — Romans');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/profile');
  const family = page.getByTestId('family');
  await family.getByLabel('Prénom').fill('Léa');
  await family.getByLabel('Lien').selectOption('child');
  await family.getByRole('button', { name: 'Ajouter' }).click();
  await expect(family.getByTestId('family-member')).toContainText('Léa');

  await page.getByRole('link', { name: 'Rechercher' }).first().click();
  await page.getByTestId('search-input').fill('Doliprane');
  await page.getByTestId('search-input').press('Enter');
  await page.getByTestId('medicine-card').first().click();
  await page.getByTestId('pharmacy-row').filter({ hasText: 'Pharmacie du Rhône' }).getByRole('button', { name: 'Choisir cette pharmacie' }).click();
  const sheet = page.getByTestId('request-sheet');
  await sheet.getByTestId('for-member-select').selectOption({ label: 'Léa (enfant)' });
  await sheet.getByRole('button', { name: 'Envoyer la demande' }).click();
  await page.getByRole('link', { name: 'Suivre ma demande' }).click();
  await expect(page.getByTestId('for-member').first()).toContainText('Pour Léa (enfant)');

  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
  await ctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  const ph = await ctx.newPage();
  await loginWithDemo(ph, 'Pharmacie du Rhône — Tournon', 'Pharmacie');
  const card = ph.getByTestId('incoming-request').filter({ hasText: 'Camille' }).first();
  await expect(card.getByTestId('for-member')).toContainText('Pour Léa (enfant)');
  await expect(card).toContainText(/Camille [A-Z]\./);
  await ctx.close();
});
