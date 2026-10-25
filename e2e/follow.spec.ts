import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

test('notify me when it is back: a patient follows an out-of-stock medicine, sees it in the account, and can stop', async ({ page }) => {
  // Find a medicine no nearby pharmacy has (through the API, as this patient).
  const { call } = await apiAs('alice@pharmacie.test');
  const all = await call<{ items: { id: string; name: string; availableAt?: number }[] }>('GET', '/medicines?lat=44.93&lon=4.88&radiusKm=30&page=1');
  let out = all.items.find((m) => !m.availableAt);
  for (let p = 2; !out && p <= 4; p++) {
    const more = await call<{ items: { id: string; name: string; availableAt?: number }[] }>('GET', `/medicines?lat=44.93&lon=4.88&radiusKm=30&page=${p}`);
    out = more.items.find((m) => !m.availableAt);
  }
  test.skip(!out, 'every demo medicine is in stock nearby');

  await loginWithDemo(page, 'Alice — Tournon');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/medicines/${out!.id}`);
  const follow = page.getByTestId('follow-button');
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/profile');
  const list = page.getByTestId('followed');
  await expect(list).toContainText(out!.name);
  await list.getByRole('button', { name: 'Ne plus me prévenir' }).click();
  await expect(list).toContainText('Aucun pour le moment');
});
