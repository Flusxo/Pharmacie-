import { expect, test } from './fixtures';
import { apiAs, loginByToken } from './helpers';

test.describe('payments (Stripe test mode) and medicine pictures', () => {
  test('without Stripe keys the order page says "Payments not configured" and offers no pay button; the rest works', async ({ page }) => {
    const alice = await apiAs('alice@pharmacie.test');
    const pharmacy = await apiAs('pharmacie.tournon@pharmacie.test');
    const found = await alice.call<{ items: { id: string; name: string }[] }>('GET', '/medicines?q=Dafalgan');
    const medicineId = found.items[0].id;
    const tournon = await alice.call<{ items: { id: string; name: string }[] }>(
      'GET',
      `/medicines/${medicineId}/pharmacies?lat=45.07&lon=4.83`,
    );
    const pharmacyId = tournon.items.find((p) => p.name === 'Pharmacie du Rhône')!.id;
    const created = await alice.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId, quantity: 1 }] });
    await alice.call('POST', `/patient/requests/${created.id}/choose`, { pharmacyId });
    const accepted = await pharmacy.call<{ orderId: string }>('POST', `/pharmacy/requests/${created.id}/accept`);

    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto(`/orders/${accepted.orderId}`);
    const card = page.getByTestId('payment-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Mode test');
    await expect(page.getByTestId('payments-not-configured')).toContainText('Paiements non configurés');
    await expect(page.getByTestId('pay-button')).toHaveCount(0);
    // The order itself is unaffected.
    await expect(page.getByTestId('order-status')).toHaveText('Acceptée');

    // The API says the same, in both languages.
    const res = await alice.ctx.fetch(`http://localhost:4100/api/patient/orders/${accepted.orderId}/pay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenOf(alice)}`, 'Accept-Language': 'en' },
    });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toMatch(/Payments not configured/);
  });

  test('medicine page, Photo mode: rendered pictures with front / three-quarter views', async ({ page }) => {
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto('/search?q=Doliprane');
    await page.getByTestId('medicine-card').first().click();
    // With graphics Off there is no 3D toggle and the photo is already shown.
    if (await page.getByTestId('toggle-photo').count()) await page.getByTestId('toggle-photo').click();
    const gallery = page.getByTestId('med-gallery');
    await expect(gallery).toBeVisible();
    await expect(gallery.getByTestId('med-view-front')).toHaveAttribute('aria-selected', 'true');
    await gallery.getByTestId('med-view-angle').click();
    await expect(gallery.getByTestId('med-view-angle')).toHaveAttribute('aria-selected', 'true');
    // every picture has a text alternative
    for (const img of await gallery.locator('img').all()) await expect(img).toHaveAttribute('alt', /Doliprane/);
  });
});

async function tokenOf(client: { ctx: import('@playwright/test').APIRequestContext }): Promise<string> {
  const res = await client.ctx.post('http://localhost:4100/api/auth/login', {
    data: { email: 'alice@pharmacie.test', password: 'Password123!' },
  });
  return ((await res.json()) as { token: string }).token;
}
