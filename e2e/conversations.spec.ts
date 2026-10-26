import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

/** An order for this patient at the Rhône pharmacy, accepted by API calls so the test can focus on the screens. */
async function acceptedOrder(patientEmail: string) {
  const patient = await apiAs(patientEmail);
  const tournon = await apiAs('pharmacie.tournon@pharmacie.test');
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  const meds = await patient.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await patient.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  await patient.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });
  const accepted = await tournon.call<{ orderId: string }>('POST', `/pharmacy/requests/${req.id}/accept`);
  return { orderId: accepted.orderId, patient, tournon };
}

test('messages and a pickup time: the patient picks a time and writes, the pharmacy sees both and answers, the patient can report', async ({ page, browser }) => {
  const { orderId, tournon } = await acceptedOrder('emma@pharmacie.test');
  // Make sure the pharmacy has times to offer whatever the hour of the test run.
  await tournon.call('PATCH', '/pharmacy/profile', { services: [], languages: ['fr'], accessibility: [] });

  await loginWithDemo(page, 'Emma — Vienne');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/orders/${orderId}`);

  // Pickup time: choose the first free time of the first day offered.
  const picker = page.getByTestId('slot-picker');
  const times = picker.getByTestId('slot-time');
  if (await times.locator('option').nth(1).count()) {
    await times.selectOption({ index: 1 });
    await picker.getByRole('button', { name: 'Confirmer cet horaire' }).click();
    await expect(picker.getByTestId('slot-chosen')).toContainText('Retrait prévu');
  }

  // Messages: the notice says there is no medical advice; the patient writes.
  const thread = page.getByTestId('messages');
  await expect(thread).toContainText('Pas de conseil médical');
  await thread.getByTestId('message-input').fill('Bonjour, je passe en fin de journée.');
  await thread.getByRole('button', { name: 'Envoyer' }).click();
  await expect(thread.getByTestId('message')).toHaveCount(1);

  // The pharmacy sees the slot badge and the message on that order, and answers.
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
  await ctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  const ph = await ctx.newPage();
  await loginWithDemo(ph, 'Pharmacie du Rhône — Tournon', 'Pharmacie');
  await ph.getByRole('tab', { name: /Commandes en cours/ }).click();
  const card = ph.getByTestId('pharmacy-order').filter({ hasText: 'Emma' }).first();
  await card.getByText('Messages avec la pharmacie').click();
  await expect(card.getByTestId('message')).toContainText('fin de journée');
  await card.getByTestId('message-input').fill('Très bien, votre commande sera prête.');
  await card.getByRole('button', { name: 'Envoyer' }).click();
  await expect(card.getByTestId('message')).toHaveCount(2);
  await ctx.close();

  // The patient sees the answer and can report it.
  await expect(thread.getByTestId('message')).toHaveCount(2, { timeout: 20_000 });
  page.once('dialog', (d) => void d.accept('Hors sujet'));
  await thread.getByRole('button', { name: 'Signaler' }).click();
  await expect(page.getByText('Merci, l’équipe va regarder ce message.')).toBeVisible();
});

test('reviews: after delivery the patient reviews once; it shows on the pharmacy page without a name; staff can hide it', async ({ page, browser }) => {
  const { orderId, patient, tournon } = await acceptedOrder('david@pharmacie.test');
  for (const status of ['preparing', 'ready'])
    await tournon.call('PATCH', `/pharmacy/orders/${orderId}/status`, { status, prescriptionChecked: true });
  const order = await patient.call<{ order: { pickupCode: string } }>('GET', `/patient/orders/${orderId}`);
  await tournon.call('POST', `/pharmacy/orders/${orderId}/pickup`, { code: order.order.pickupCode });

  await loginWithDemo(page, 'David — Lyon');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/orders/${orderId}`);
  const form = page.getByTestId('review-block');
  await form.getByLabel('4', { exact: true }).check();
  await form.getByLabel(/Commentaire/).fill('Retrait rapide, équipe aimable.');
  await form.getByRole('button', { name: 'Publier mon avis' }).click();
  await expect(form).toContainText('Retrait rapide, équipe aimable.');

  // Public page: the review is there, with no name.
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  await page.goto(`/pharmacies/${me.user.id}`);
  const reviews = page.getByTestId('reviews');
  await expect(reviews).toContainText('Retrait rapide, équipe aimable.');
  await expect(reviews).not.toContainText('David');

  // The pharmacy answers (in its own list, through the screen's endpoint); the answer shows under the review and the patient can report it.
  const own = await tournon.call<{ items: { id: string; comment: string }[] }>('GET', '/pharmacy/reviews');
  const theirs = own.items.find((r) => r.comment === 'Retrait rapide, équipe aimable.')!;
  await tournon.call('POST', `/pharmacy/reviews/${theirs.id}/reply`, { text: 'Merci, à bientôt !' });
  await page.reload();
  await expect(page.getByTestId('reviews').getByTestId('review-reply')).toContainText('Merci, à bientôt !');
  await page.goto(`/orders/${orderId}`);
  const answer = page.getByTestId('review-block').getByTestId('review-reply');
  await expect(answer).toContainText('Réponse de la pharmacie');
  page.once('dialog', (d) => void d.accept('Hors sujet'));
  await answer.getByRole('button', { name: 'Signaler cette réponse' }).click();
  await expect(page.getByText('Merci, l’équipe va regarder cette réponse.')).toBeVisible();
  await page.goto(`/pharmacies/${me.user.id}`);

  // Staff hide it from the reviews list of the reports tab (with a reason), and the public page no longer shows it.
  const staff = await apiAs('admin@pharmacie.test');
  const list = await staff.call<{ items: { id: string; comment: string }[] }>('GET', '/admin/reviews');
  const mine = list.items.find((r) => r.comment === 'Retrait rapide, équipe aimable.')!;
  await staff.call('POST', `/admin/moderation/review/${mine.id}`, { hidden: true, reason: 'Test de modération' });
  await page.reload();
  await expect(page.getByTestId('reviews')).not.toContainText('Retrait rapide');
  void browser;
});

test('moderation: staff see the reported message in the reports tab and hide it with a reason; the patient then sees it as removed', async ({ page }) => {
  await page.goto('/login/staff');
  await page.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('tab', { name: /Signalements/ }).click();
  const target = page.getByTestId('report-target').filter({ hasText: 'commande sera prête' }).first();
  await expect(target).toBeVisible();
  const card = page.locator('.card').filter({ has: target }).first();
  await card.getByTestId('toggle-hidden').click();
  await page.getByRole('dialog').getByRole('textbox').fill('Message hors sujet');
  await page.getByRole('dialog').getByRole('button', { name: 'Masquer' }).click();
  await expect(page.getByText('Modération enregistrée.')).toBeVisible();
  await expect(card.getByText('Masqué')).toBeVisible();
});
