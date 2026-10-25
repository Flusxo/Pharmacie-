import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('pharmacy profile: patients open it from the list (hours, services, languages, accessibility) and a cheapest badge marks the lowest price', async ({ page }) => {
  await loginWithDemo(page, 'Alice — Tournon');
  await page.getByTestId('search-input').fill('Doliprane');
  await page.getByTestId('search-input').press('Enter');
  await page.getByTestId('medicine-card').first().click();
  const rows = page.getByTestId('pharmacy-row');
  await expect(rows.first()).toBeVisible();
  // At least two priced pharmacies in stock: exactly the lowest price carries the badge.
  await expect(page.getByText('Le moins cher à proximité').first()).toBeVisible();
  await rows.first().getByRole('link').first().click();
  const profile = page.getByTestId('pharmacy-profile');
  await expect(profile.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(profile.getByText('Vérifiée par l’équipe')).toBeVisible();
  await expect(profile.getByRole('heading', { name: 'Horaires' })).toBeVisible();
  await expect(profile.getByRole('heading', { name: 'Langues parlées' })).toBeVisible();
  await expect(profile.getByRole('heading', { name: 'Accessibilité' })).toBeVisible();
  await expect(profile.getByText('Français')).toBeVisible();
});

test('a pharmacy edits its profile and takes a break that pauses it', async ({ page }) => {
  await loginWithDemo(page, 'Romans', 'Pharmacie');
  await expect(page).toHaveURL(/\/pharmacy$/);
  await page.getByRole('tab', { name: 'Fiche' }).click();
  const form = page.getByTestId('profile-form');
  await form.getByLabel('Espagnol').check();
  await form.getByLabel('Boucle auditive').check();
  await form.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByText('Fiche enregistrée.')).toBeVisible();
  await page.getByTestId('break-select').selectOption('30');
  await expect(page.getByText(/En pause jusqu’à/)).toBeVisible();
});
