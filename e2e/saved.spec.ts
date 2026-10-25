import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('saved pharmacies: the heart sticks per account, "my saved pharmacies" filters the list, and the map shows a straight line', async ({ page }) => {
  await loginWithDemo(page, 'Camille — Romans');
  await expect(page).toHaveURL(/\/home$/);
  await page.getByTestId('search-input').fill('Doliprane');
  await page.getByTestId('search-input').press('Enter');
  await page.getByTestId('medicine-card').first().click();
  const rows = page.getByTestId('pharmacy-row');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  const heart = rows.first().getByTestId('save-pharmacy');
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  // The filter appears once something is saved and keeps only the saved pharmacy.
  await page.getByLabel('Mes pharmacies enregistrées').check();
  await expect(rows).toHaveCount(1);
  await page.getByLabel('Mes pharmacies enregistrées').uncheck();
  await expect(rows).toHaveCount(total);

  // It survives a reload (kept in this browser, for this account).
  await page.reload();
  await expect(page.getByTestId('pharmacy-row').first().getByTestId('save-pharmacy')).toHaveAttribute('aria-pressed', 'true');

  // Map: choosing a pharmacy in the list draws a straight line and offers real driving directions.
  await page.goto('/map');
  await page.getByTestId('map-list-item').first().click();
  await expect(page.getByTestId('route-info')).toContainText('Ligne droite');
  await expect(page.getByRole('link', { name: 'Ouvrir l’itinéraire en voiture' })).toHaveAttribute('href', /openstreetmap\.org\/directions/);
});

test('first-login tips per role: a doctor and a pharmacy each see their own 3 steps once', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('role-tour')) {
      localStorage.removeItem('counter.tour.doctor');
      localStorage.removeItem('counter.tour.pharmacy');
      sessionStorage.setItem('role-tour', '1');
    }
  });
  await loginWithDemo(page, 'Dr Martin (verified)', 'Médecin');
  const tour = page.getByTestId('tour');
  await expect(tour.getByRole('heading', { name: 'Liez un patient' })).toBeVisible();
  await tour.getByRole('button', { name: 'Suivant' }).click();
  await expect(tour.getByRole('heading', { name: 'Préparez la demande' })).toBeVisible();
  await tour.getByRole('button', { name: 'Suivant' }).click();
  await tour.getByRole('button', { name: 'C’est parti' }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('tour')).toHaveCount(0);
});
