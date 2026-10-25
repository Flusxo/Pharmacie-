import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

test('devices: the account page lists this device; signing out of every device ends the session here too', async ({ page }) => {
  await loginWithDemo(page, 'David — Lyon');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/profile');
  const devices = page.getByTestId('devices');
  await expect(devices.getByTestId('device').first()).toContainText('Cet appareil');
  await devices.getByTestId('logout-all').click();
  await expect(page).toHaveURL(/\/login|\/$/);
  // The old token no longer works: going to a private page sends the visitor to log in.
  await page.goto('/requests');
  await expect(page).toHaveURL(/\/login/);
});
