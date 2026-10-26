import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { API, PASSWORD, loginWithDemo } from './helpers';

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.doctor', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  return ctx.newPage();
}

test.describe('full cycle across roles (Phase 8)', () => {
  test('patient requests, pharmacy accepts and moves the order to Delivered, tracking updates each time', async ({ page, browser }) => {
    // Patient: Dafalgan from Pharmacie du Rhône.
    await loginWithDemo(page, 'Alice — Tournon');
    await expect(page).toHaveURL(/\/home$/);
    await page.getByTestId('search-input').fill('Dafalgan');
    await page.getByTestId('search-input').press('Enter');
    await page.getByTestId('medicine-card').filter({ hasText: 'Dafalgan 500 mg' }).click();
    await page
      .getByTestId('pharmacy-row')
      .filter({ hasText: 'Pharmacie du Rhône' })
      .getByRole('button', { name: 'Choisir cette pharmacie' })
      .click();
    await page.getByTestId('request-sheet').getByRole('button', { name: 'Envoyer la demande' }).click();
    await page.getByRole('link', { name: 'Suivre ma demande' }).click();
    await expect(page.getByText(/En attente de réponse de Pharmacie du Rhône/)).toBeVisible();

    // Pharmacy, in its own browser window: dashboard (no more "page not found").
    const ph = await newPage(browser);
    await loginWithDemo(ph, 'Pharmacie du Rhône — Tournon', 'Pharmacie');
    await expect(ph).toHaveURL(/\/pharmacy$/);
    await expect(ph.getByRole('heading', { level: 1, name: 'Pharmacie du Rhône' })).toBeVisible();
    const card = ph.getByTestId('incoming-request').filter({ hasText: 'Dafalgan' });
    await expect(card).toContainText('Alice M.');
    await expect(card.getByRole('timer')).toBeVisible();
    await card.getByRole('button', { name: 'Accepter' }).click();
    await expect(card).toHaveCount(0);

    // Patient follows the order (request page refreshes itself, then the tracking page).
    await page.getByRole('link', { name: 'Voir la commande' }).click({ timeout: 20_000 });
    await expect(page.getByTestId('order-status')).toHaveText('Acceptée');

    await ph.getByRole('tab', { name: /Commandes en cours/ }).click();
    const order = ph.getByTestId('pharmacy-order').filter({ hasText: 'Dafalgan' });
    for (const label of ['En préparation', 'Prête', 'En livraison', 'Livrée']) {
      await order.getByTestId('order-next').click();
      await expect(page.getByTestId('order-status')).toHaveText(label, { timeout: 20_000 });
    }
    // Confetti on Delivered (2D overlay, since this test runs with Graphics "Off").
    await expect(page.getByTestId('confetti')).toHaveAttribute('data-fired', '1');
    // Delivered: no more status buttons for this order (only valid next statuses are offered).
    await ph.getByLabel('Afficher aussi les commandes terminées').check();
    await expect(ph.getByTestId('pharmacy-order').filter({ hasText: 'Dafalgan' }).getByTestId('order-next')).toHaveCount(0);
    await ph.context().close();
  });

  test('doctor creates a request for a confirmed patient; unconfirmed patients cannot be chosen and the API refuses them', async ({
    page,
    request,
  }) => {
    await loginWithDemo(page, 'Dr Martin (verified)', 'Médecin');
    await expect(page).toHaveURL(/\/doctor$/);
    await expect(
      page
        .getByTestId('doctor-patient')
        .filter({ hasText: 'Camille' })
        .or(page.getByTestId('doctor-patient').filter({ hasText: 'c***@' })),
    ).toContainText('En attente de confirmation');
    await expect(page.locator('body')).not.toContainText('Rue Gabriel');

    await page.getByRole('tab', { name: 'Nouvelle demande' }).click();
    const select = page.getByLabel('Patient (lien confirmé)');
    await expect(select.locator('option')).toHaveCount(3);
    expect((await select.locator('option').allTextContents()).sort()).toEqual(['Alice Moreau', 'Bruno Lefèvre', 'Choisir un patient']);
    await expect(select.locator('option', { hasText: 'Camille' })).toHaveCount(0);
    await select.selectOption({ label: 'Alice Moreau' });
    await page.getByLabel('Rechercher un médicament').fill('Amoxicilline Biog');
    await page.getByRole('option', { name: /Amoxicilline Biogaran 1 g/ }).click();
    await page.getByLabel('Instructions').fill('1 comprimé matin et soir pendant 6 jours');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByTestId('doctor-sent')).toContainText('Le patient choisira lui-même sa pharmacie');

    // Camille (unconfirmed) is refused by the API too.
    const login = await request.post(`${API}/auth/login`, { data: { email: 'dr.martin@pharmacie.test', password: PASSWORD } });
    const { token } = await login.json();
    const pts = await (await request.get(`${API}/doctor/patients`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const camille = pts.items.find((p: { confirmed: boolean }) => !p.confirmed);
    const med = (await (await request.get(`${API}/medicines?q=zyrtec`)).json()).items[0];
    const res = await request.post(`${API}/doctor/requests`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { patientId: camille.id, items: [{ medicineId: med.id, quantity: 1 }] },
    });
    expect(res.status()).toBe(403);
  });

  test('support sees the verification queue without verify buttons', async ({ page }) => {
    await page.goto('/login/staff');
    await page.getByTestId('demo-panel').getByRole('button', { name: 'Support' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId('staff-role')).toContainText('support');
    await expect(page.getByTestId('verification').filter({ hasText: 'Pharmacie Démo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider' })).toHaveCount(0);
  });

  test('a pending pharmacy waits, admin verifies it, then it reaches its dashboard', async ({ page, browser }) => {
    await loginWithDemo(page, 'Démo (pending)', 'Pharmacie');
    await expect(page).toHaveURL(/\/waiting$/);
    await expect(page.getByTestId('waiting')).toContainText('En attente de validation');
    // The applicant sends a document for the verification (a tiny valid PNG).
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
    await page.getByTestId('file-input').setInputFiles({ name: 'autorisation.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByTestId('verification-files').getByTestId('private-file')).toContainText('autorisation.png');

    const admin = await newPage(browser);
    await admin.goto('/login/staff');
    await admin.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
    await admin.getByRole('button', { name: 'Se connecter' }).click();
    const row = admin.getByTestId('verification').filter({ hasText: 'Pharmacie Démo' });
    // The staff see the document, and cannot approve before the checklist is complete.
    await row.getByText('Justificatifs envoyés').click();
    await expect(row.getByTestId('private-file')).toContainText('autorisation.png');
    await expect(row.getByRole('button', { name: 'Valider' })).toBeDisabled();
    for (const label of [/format/, /nom correspond/, /lisible/]) await row.getByLabel(label).check();
    await row.getByRole('button', { name: 'Valider' }).click();
    await expect(row).toHaveCount(0);
    await admin.getByRole('tab', { name: 'Journal d’audit' }).click();
    await expect(admin.getByRole('cell', { name: 'approve_pharmacy' }).first()).toBeVisible();
    await admin.context().close();

    await page.getByRole('button', { name: 'Vérifier à nouveau' }).click();
    await expect(page).toHaveURL(/\/pharmacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pharmacie Démo' })).toBeVisible();
  });

  test('every role has an account page and a notifications bell; unknown routes show a real 404', async ({ page }) => {
    for (const [label, tab] of [
      ['Dr Martin (verified)', 'Médecin'],
      ['Pharmacie du Rhône — Tournon', 'Pharmacie'],
    ] as const) {
      await loginWithDemo(page, label, tab);
      await expect(page.getByTestId('bell')).toBeVisible();
      await page.goto('/profile');
      await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();
      await expect(page.getByTestId('account-identity')).toBeVisible();
      await expect(page.getByTestId('graphics-quality')).toBeVisible();
      await expect(page.getByTestId('reduce-motion')).toBeVisible();
      await page.getByRole('button', { name: 'Se déconnecter' }).click();
    }
    await page.goto('/this/does/not/exist');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });
});
