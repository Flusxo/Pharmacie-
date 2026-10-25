import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('style guide: staff reach it from the dashboard and see tokens in light and dark; patients cannot open it', async ({ page }) => {
  await page.goto('/login/staff');
  await page.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: /Guide de style/ }).click();
  const ds = page.getByTestId('design-system');
  await expect(ds.getByRole('heading', { name: 'Guide de style' })).toBeVisible();
  await expect(ds).toContainText('--brand');
  const light = await ds.locator('code', { hasText: '--surface' }).first().locator('xpath=following-sibling::span').innerText();
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await expect.poll(async () => ds.locator('code', { hasText: '--surface' }).first().locator('xpath=following-sibling::span').innerText()).not.toBe(light);
});

test('style guide is for staff only', async ({ page }) => {
  await loginWithDemo(page, 'Alice — Tournon');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/admin/design');
  await expect(page.getByTestId('design-system')).toHaveCount(0);
});
