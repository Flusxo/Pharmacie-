import { expect, test } from './fixtures';
import { apiAs, loginByToken } from './helpers';

/**
 * The payment flow, end to end, on the simulated Stripe page (the e2e API runs with STRIPE_FAKE=1; the real Stripe
 * needs keys and is tested by hand, see DEPLOY.md). Everything else is the real API and the real frontend.
 */
// Each order gets its own quantity: an identical request within 2 minutes is the same request (idempotency).
let seq = 0;
async function acceptedOrder(quantity = 1 + ++seq) {
  const alice = await apiAs('alice@pharmacie.test');
  const pharmacy = await apiAs('pharmacie.tournon@pharmacie.test');
  const found = await alice.call<{ items: { id: string }[] }>('GET', '/medicines?q=Dafalgan');
  const medicineId = found.items[0].id;
  const near = await alice.call<{ items: { id: string; name: string }[] }>('GET', `/medicines/${medicineId}/pharmacies?lat=45.07&lon=4.83`);
  const pharmacyId = near.items.find((p) => p.name === 'Pharmacie du Rhône')!.id;
  const created = await alice.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId, quantity }] });
  await alice.call('POST', `/patient/requests/${created.id}/choose`, { pharmacyId });
  const accepted = await pharmacy.call<{ orderId: string }>('POST', `/pharmacy/requests/${created.id}/accept`);
  const move = (status: string) =>
    pharmacy.call('PATCH', `/pharmacy/orders/${accepted.orderId}/status`, { status, prescriptionChecked: true });
  return { requestId: created.id, orderId: accepted.orderId, move, alice };
}

test.describe('payments (Stripe test mode, simulated Stripe page)', () => {
  test('pay after the pharmacy accepted: held, receipt, visible to pharmacy and staff, captured when ready', async ({ page, browser }) => {
    const { orderId, move } = await acceptedOrder();
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto(`/orders/${orderId}`);
    const card = page.getByTestId('payment-card');
    await expect(card).toContainText('Mode test');
    await expect(page.getByTestId('payment-status')).toHaveText('Non payé');
    await card.getByTestId('pay-button').click();

    // Stripe's page (simulated): the test card 4242 pays.
    await expect(page.getByTestId('fake-stripe')).toBeVisible();
    await expect(page.getByLabel('Numéro de carte de test')).toHaveValue('4242 4242 4242 4242');
    await page.getByTestId('fake-stripe-pay').click();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}\\?payment=return`));
    await expect(page.getByTestId('payment-status')).toHaveText('Montant bloqué');

    // Receipt page with the lines and the total.
    await page.getByTestId('receipt-link').click();
    await expect(page.getByTestId('receipt')).toContainText('Dafalgan');
    await expect(page.getByTestId('receipt')).toContainText('paiement en mode test');

    // The pharmacy sees the payment status on its order (and nothing about a card).
    const ph = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
    await ph.addInitScript(() => {
      localStorage.setItem('counter.graphics', 'off');
      localStorage.setItem('counter.tour', 'done');
    });
    const p2 = await ph.newPage();
    await loginByToken(p2, 'pharmacie.tournon@pharmacie.test');
    await p2.goto('/pharmacy');
    await p2.getByRole('tab', { name: /Commandes en cours/ }).click();
    const order = p2.getByTestId('pharmacy-order').filter({ hasText: 'Dafalgan' }).first();
    await expect(order.getByTestId('order-payment')).toHaveText('Montant bloqué');

    // The pharmacy prepares and marks it ready: the held amount is captured.
    await move('preparing');
    await move('ready');
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId('payment-status')).toHaveText('Payé');

    // Staff see the status too.
    const adm = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
    await adm.addInitScript(() => {
      localStorage.setItem('counter.graphics', 'off');
      localStorage.setItem('counter.tour', 'done');
    });
    const p3 = await adm.newPage();
    await loginByToken(p3, 'admin@pharmacie.test');
    await p3.goto('/admin');
    await p3.getByRole('tab', { name: 'Commandes' }).click();
    await expect(p3.getByTestId('admin-order-payment').filter({ hasText: 'Payé' }).first()).toBeVisible();
  });

  test('declined card: nothing is charged, the order stays, and a second try with the good card works', async ({ page }) => {
    const { orderId } = await acceptedOrder();
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto(`/orders/${orderId}`);
    await page.getByTestId('pay-button').click();
    await page.getByLabel('Numéro de carte de test').fill('4000 0000 0000 0002');
    await page.getByTestId('fake-stripe-pay').click();
    await expect(page.getByTestId('fake-stripe-error')).toContainText('refusée');
    await page.getByRole('link', { name: 'Retour à la commande' }).click();
    await expect(page.getByTestId('payment-status')).toHaveText('Échec');
    await expect(page.getByTestId('receipt-link')).toHaveCount(0);
    await expect(page.getByTestId('order-status')).toHaveText('Acceptée');

    await page.getByTestId('pay-button').click();
    await page.getByTestId('fake-stripe-pay').click();
    await expect(page.getByTestId('payment-status')).toHaveText('Montant bloqué');
  });

  test('cancelling releases the held amount; cancelling after capture refunds it', async ({ page }) => {
    const first = await acceptedOrder();
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto(`/orders/${first.orderId}`);
    await page.getByTestId('pay-button').click();
    await page.getByTestId('fake-stripe-pay').click();
    await expect(page.getByTestId('payment-status')).toHaveText('Montant bloqué');
    await page.getByRole('button', { name: 'Annuler la commande' }).click();
    await expect(page.getByTestId('order-status')).toHaveText('Annulée');
    await expect(page.getByTestId('payment-status')).toHaveText('Annulé');

    const second = await acceptedOrder();
    await page.goto(`/orders/${second.orderId}`);
    await page.getByTestId('pay-button').click();
    await page.getByTestId('fake-stripe-pay').click();
    await expect(page.getByTestId('payment-status')).toHaveText('Montant bloqué');
    await second.move('preparing');
    await second.move('ready');
    await page.reload();
    await expect(page.getByTestId('payment-status')).toHaveText('Payé');
    await second.move('cancelled');
    await page.reload();
    await expect(page.getByTestId('payment-status')).toHaveText('Remboursé');
    await expect(page.getByTestId('payment-card')).toContainText('remboursé');
  });

  test('no payment before the pharmacy accepts: the request has no payment card and no order page', async ({ page }) => {
    const alice = await apiAs('alice@pharmacie.test');
    const found = await alice.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
    const created = await alice.call<{ id: string }>('POST', '/patient/requests', {
      items: [{ medicineId: found.items[0].id, quantity: 1 }],
    });
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto(`/requests/${created.id}`);
    await expect(page.getByTestId('payment-card')).toHaveCount(0);
    await page.goto(`/orders/${created.id}`);
    await expect(page.getByTestId('payment-card')).toHaveCount(0);
    await expect(page.getByTestId('pay-button')).toHaveCount(0);
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
    for (const img of await gallery.locator('img').all()) await expect(img).toHaveAttribute('alt', /Doliprane/);
  });
});
