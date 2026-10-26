import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

test('refill: after a delivered order the patient sets a reminder (a date only), sees it in the account, and can request the same again', async ({ page }) => {
  const patient = await apiAs('david@pharmacie.test');
  const tournon = await apiAs('pharmacie.tournon@pharmacie.test');
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  const meds = await patient.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await patient.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  await patient.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });
  const { orderId } = await tournon.call<{ orderId: string }>('POST', `/pharmacy/requests/${req.id}/accept`);
  for (const status of ['preparing', 'ready']) await tournon.call('PATCH', `/pharmacy/orders/${orderId}/status`, { status, prescriptionChecked: true });
  const order = await patient.call<{ order: { pickupCode: string } }>('GET', `/patient/orders/${orderId}`);
  await tournon.call('POST', `/pharmacy/orders/${orderId}/pickup`, { code: order.order.pickupCode });

  await loginWithDemo(page, 'David — Lyon');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/orders/${orderId}`);
  const block = page.getByTestId('refill-block');
  await expect(block).toContainText('jamais une indication de dose');
  await block.getByRole('combobox').selectOption('14');
  await block.getByRole('button', { name: 'Me le rappeler' }).click();
  await expect(block.getByTestId('reminder-set')).toContainText('Rappel le');

  await page.goto('/profile');
  await expect(page.getByTestId('reminders')).toContainText('Doliprane');

  await page.goto('/requests');
  await page.getByTestId('repeat-request').first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
