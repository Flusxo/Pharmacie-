import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('medicine page: section links jump to the pharmacy list; on a phone a sticky bar sends the request once the main button scrolls away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await loginWithDemo(page, 'Alice — Tournon');
  await page.getByTestId('search-input').fill('Doliprane');
  await page.getByTestId('search-input').press('Enter');
  await page.getByTestId('medicine-card').first().click();
  const tabs = page.getByTestId('med-tabs');
  await expect(tabs.getByRole('link', { name: 'Stock à proximité' })).toBeVisible();
  // With the main button on screen there is no second bar.
  await page.getByTestId('request-button').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('sticky-request')).toHaveCount(0);
  await tabs.getByRole('link', { name: 'Stock à proximité' }).click();
  await expect(page.getByTestId('pharmacy-row').first()).toBeInViewport();
  const bar = page.getByTestId('sticky-request');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Demander à une pharmacie' }).click();
  await expect(page.getByTestId('request-sheet')).toBeVisible();
});
