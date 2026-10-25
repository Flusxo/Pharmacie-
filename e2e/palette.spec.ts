import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('command palette: Ctrl+K opens it, typing filters pages, Enter goes there, Esc closes', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('palette');
  await expect(palette).toBeVisible();
  await page.getByRole('combobox', { name: /Aller à une page/ }).fill('FAQ');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/faq$/);
  await page.keyboard.press('Control+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('a patient finds a medicine from the palette; an empty search offers popular searches and spelling tips', async ({ page }) => {
  await loginWithDemo(page, 'Alice — Tournon');
  await expect(page).toHaveURL(/\/home$/);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Aller à une page/ }).fill('Dolip');
  await expect(page.getByRole('option').first()).toContainText('Doliprane');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/medicines\//);
  await page.goto('/search?q=zzzzqq');
  await expect(page.getByTestId('popular')).toBeVisible();
  await page.getByTestId('popular').getByRole('button', { name: 'Doliprane' }).click();
  await expect(page.getByTestId('medicine-card').first()).toBeVisible();
});
