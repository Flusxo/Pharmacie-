import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

test('who looked at my data: the pharmacy that opens a request appears on the patient’s account page, in plain words, once', async ({ page }) => {
  const patient = await apiAs('emma@pharmacie.test');
  const tournon = await apiAs('pharmacie.tournon@pharmacie.test');
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  const meds = await patient.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await patient.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  await patient.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });
  for (let i = 0; i < 3; i++) await tournon.call('GET', '/pharmacy/incoming');

  await loginWithDemo(page, 'Emma — Vienne');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/profile');
  const log = page.getByTestId('access-log');
  await expect(log).toContainText('Qui a consulté mes données');
  await expect(log.getByTestId('access-entry').filter({ hasText: 'Pharmacie du Rhône a consulté votre demande.' })).toHaveCount(1);
});
