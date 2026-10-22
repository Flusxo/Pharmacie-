import { expect, test } from './fixtures';
import { apiAs, expectNoBuyWording, loginWithDemo } from './helpers';

test.describe('patient flow (real API + real frontend)', () => {
  test('login, search, details, request, then live order tracking', async ({ page }) => {
    // Login page: staff link + demo panel, then Alice.
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Connexion équipe' })).toBeVisible();
    await expect(page.getByTestId('demo-panel')).toBeVisible();
    await expect(page.getByTestId('prototype-notice')).toContainText('Prototype uniquement');
    await loginWithDemo(page, 'Alice — Tournon');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'Bonjour Alice' })).toBeVisible();
    await expect(page.getByText('Douleur & fièvre')).toBeVisible();

    // Search: "para" and the typo "dolliprane".
    await page.getByTestId('search-input').fill('para');
    await page.getByTestId('search-input').press('Enter');
    await expect(page).toHaveURL(/\/search\?q=para/);
    await expect(page.getByTestId('medicine-card').first()).toContainText('Paracétamol');
    await page.getByTestId('search-input').fill('dolliprane');
    await page.getByTestId('search-input').press('Enter');
    const card = page.getByTestId('medicine-card').filter({ hasText: 'Doliprane 1000 mg' });
    await expect(card).toBeVisible();
    await expectNoBuyWording(page);

    // Details: nearest pharmacy first, request flow sheet.
    await card.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Doliprane 1000 mg' })).toBeVisible();
    await expect(page.getByTestId('pharmacy-row').first()).toContainText('Pharmacie du Rhône');
    await expect(page.getByTestId('request-button')).toHaveText('Demander à une pharmacie');
    await expectNoBuyWording(page);
    await page.getByTestId('request-button').click();
    const sheet = page.getByTestId('request-sheet');
    await sheet.getByRole('radio').first().check();
    await sheet.getByRole('button', { name: 'Continuer' }).click();
    await expect(sheet).toContainText('Pharmacie du Rhône');
    await sheet.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByTestId('request-sent')).toBeVisible();
    await page.getByRole('link', { name: 'Suivre ma demande' }).click();
    await expect(page.getByText(/En attente de réponse de Pharmacie du Rhône/)).toBeVisible();
    const requestId = page.url().split('/').pop()!;

    // The pharmacy (played through the API here; Phase 8 drives its dashboard) accepts.
    const pharmacy = await apiAs('pharmacie.tournon@pharmacie.test');
    const incoming = await pharmacy.call<{ items: { id: string; patientName: string }[] }>('GET', '/pharmacy/incoming');
    expect(incoming.items.find((r) => r.id === requestId)?.patientName).toBe('Alice M.');
    const { orderId } = await pharmacy.call<{ orderId: string }>('POST', `/pharmacy/requests/${requestId}/accept`);

    // Tracking page updates by itself (10 s refresh) after each status change.
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId('order-status')).toHaveText('Acceptée');
    await expect(page.getByRole('region', { name: 'Suivi simulé' })).toBeVisible();
    for (const [status, label] of [
      ['preparing', 'En préparation'],
      ['ready', 'Prête'],
    ] as const) {
      await pharmacy.call('PATCH', `/pharmacy/orders/${orderId}/status`, { status });
      await expect(page.getByTestId('order-status')).toHaveText(label, { timeout: 20_000 });
    }
    await expectNoBuyWording(page);
    await pharmacy.ctx.dispose();
  });

  test('a prescription medicine cannot be sent without the prescription statement', async ({ page }) => {
    await loginWithDemo(page, 'Bruno — Valence');
    await expect(page).toHaveURL(/\/home$/);
    await page.getByTestId('search-input').fill('Amoxicilline Biogaran');
    await page.getByTestId('search-input').press('Enter');
    await page.getByTestId('medicine-card').filter({ hasText: 'Amoxicilline Biogaran 1 g' }).click();
    await expect(page.getByText('Pourquoi faut-il une ordonnance ?')).toBeVisible();
    await page.getByRole('button', { name: 'Choisir cette pharmacie' }).first().click();
    const sheet = page.getByTestId('request-sheet');
    const send = sheet.getByRole('button', { name: 'Envoyer la demande' });
    await expect(send).toBeDisabled();
    await sheet.getByTestId('rx-check').check();
    await expect(send).toBeEnabled();
  });

  test('a wrong password shows the generic message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Adresse e-mail').fill('alice@pharmacie.test');
    await page.getByLabel('Mot de passe').fill('wrong-password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    // The API answers in the UI language (French here).
    await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.');
  });

  test('staff can log in from the staff link', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Connexion équipe' }).click();
    await expect(page).toHaveURL(/\/login\/staff$/);
    await page.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
