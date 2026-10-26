import { expect, test } from './fixtures';
import { apiAs, loginByToken } from './helpers';

test('feature switches and weekly summary: staff read the week, an admin switches messages off with a reason, patients see it off, then it is switched back on; support cannot change it', async ({ page, browser }) => {
  // An order to look at.
  const patient = await apiAs('camille@pharmacie.test');
  const tournon = await apiAs('pharmacie.tournon@pharmacie.test');
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  const meds = await patient.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await patient.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  await patient.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });
  const { orderId } = await tournon.call<{ orderId: string }>('POST', `/pharmacy/requests/${req.id}/accept`);

  // Support: reads the week and the switches, cannot change them.
  await page.goto('/login/staff');
  await page.getByTestId('demo-panel').getByRole('button', { name: 'Support' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('tab', { name: 'Statistiques' }).click();
  await expect(page.getByTestId('weekly-summary')).toContainText('Demandes');
  await expect(page.getByTestId('weekly-summary')).not.toContainText('@');
  await expect(page.getByTestId('feature-switches')).toContainText('Messages sur une commande');
  await expect(page.getByTestId('flip-messages')).toHaveCount(0);

  // Admin: switches messages off, with a reason.
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
  await ctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  const admin = await ctx.newPage();
  const pctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
  await pctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  const pp = await pctx.newPage();
  try {
    await admin.goto('/login/staff');
    await admin.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
    await admin.getByRole('button', { name: 'Se connecter' }).click();
    await admin.getByRole('tab', { name: 'Statistiques' }).click();
    admin.once('dialog', (d) => void d.accept('Maintenance de la messagerie'));
    await admin.getByTestId('flip-messages').click();
    await expect(admin.getByTestId('feature-messages')).toContainText('Désactivée');

    // A patient (own browser context) no longer sees the message form, and the API refuses a new message.
    await loginByToken(pp, 'camille@pharmacie.test');
    await pp.goto(`/orders/${orderId}`);
    await expect(pp.getByTestId('messages-off')).toBeVisible();
    await expect(pp.getByTestId('message-input')).toBeHidden();
    const refused = await patient.ctx.post('http://localhost:4100/api/patient/orders/' + orderId + '/messages', {
      data: { body: 'Bonjour' },
      headers: { Authorization: 'Bearer ' + (await (await patient.ctx.post('http://localhost:4100/api/auth/login', { data: { email: 'camille@pharmacie.test', password: 'Password123!' } })).json()).token },
    });
    expect(refused.status()).toBe(503);
  } finally {
    // Always put it back.
    const back = await apiAs('admin@pharmacie.test');
    await back.call('PUT', '/admin/features/messages', { on: true, reason: 'Fin du test' });
    await ctx.close();
  }
  await pp.reload();
  await expect(pp.getByTestId('messages-off')).toHaveCount(0);
  await expect(pp.getByTestId('message-input')).toBeVisible();
  await pctx.close();
});
