import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loginWithDemo } from './helpers';

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

test.describe('pharmacy proposals and admin analytics', () => {
  test('a pharmacy proposes a new medicine (look-alike warning first), staff approve it, patients can then find it', async ({
    page,
    browser,
  }) => {
    await loginWithDemo(page, 'Valence', 'Pharmacie');
    await expect(page).toHaveURL(/\/pharmacy$/);
    await page.getByRole('tab', { name: /Stock/ }).click();
    const form = page.getByTestId('propose-medicine');
    await form.locator('summary').click();

    // A look-alike of an existing medicine: warned, with the existing one shown.
    await form.getByLabel('Code CIP13 (13 chiffres)').fill('3400999100011');
    await form.getByLabel('Nom', { exact: true }).fill('Doliprane 1000 mg');
    await form.getByLabel('Substance active').fill('paracétamol');
    await form.getByLabel('Dosage').fill('1000 mg');
    await form.getByLabel('Catégorie').fill('pain');
    await form.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(page.getByTestId('duplicate-warning')).toContainText('Doliprane 1000 mg');

    // A genuinely new medicine goes through and shows up as pending.
    await form.getByLabel('Code CIP13 (13 chiffres)').fill('3400999100028');
    await form.getByLabel('Nom', { exact: true }).fill('Quivraxol Démo');
    await form.getByLabel('Substance active').fill('quivraxine');
    await form.getByLabel('Dosage').fill('5 mg');
    await form.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(page.getByTestId('my-proposals')).toContainText('Quivraxol Démo');
    await expect(page.getByTestId('my-proposals')).toContainText('En attente');

    // Staff: the review list shows it; a moderator approves it.
    const staff = await newPage(browser);
    await staff.goto('/login/staff');
    await staff.getByTestId('demo-panel').getByRole('button', { name: 'Moderator' }).click();
    await staff.getByRole('button', { name: 'Se connecter' }).click();
    await staff.getByRole('tab', { name: 'Propositions' }).click();
    const card = staff.getByTestId('medicine-review').filter({ hasText: 'Quivraxol Démo' });
    await expect(card).toContainText('Proposé par');
    await card.getByTestId('review-approve').click();
    await expect(card).toHaveCount(0);

    // A patient can find it only now.
    const patient = await newPage(browser);
    await loginWithDemo(patient, 'Alice — Tournon');
    await patient.getByTestId('search-input').fill('Quivraxol');
    await patient.getByTestId('search-input').press('Enter');
    await expect(patient.getByTestId('medicine-card').filter({ hasText: 'Quivraxol Démo' })).toBeVisible();
  });

  test('admin analytics: aggregated numbers, a period switch, a text alternative for the chart and no personal data', async ({ page }) => {
    await page.goto('/login/staff');
    await page.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('tab', { name: 'Statistiques' }).click();
    const panel = page.getByTestId('analytics');
    await expect(panel).toContainText('Données agrégées uniquement');
    const dl = page.waitForEvent('download');
    await page.getByTestId('analytics-csv').click();
    expect((await dl).suggestedFilename()).toMatch(/^counter-analytics-d+d.csv$/);
    await expect(panel.getByRole('img', { name: /Demandes par jour/ })).toBeVisible();
    await panel.getByLabel('Période').selectOption('7');
    await expect(panel.getByRole('img', { name: /Demandes par jour/ })).toBeVisible();
    await panel.getByText('Voir les chiffres en tableau').click();
    await expect(panel.locator('details table tbody tr')).toHaveCount(7);
    const text = await panel.innerText();
    expect(text).not.toMatch(/@/);
    for (const person of ['Alice', 'Bruno', 'Camille']) expect(text).not.toContain(person);
  });

  test('analytics fits a phone: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/login/staff');
    await page.getByTestId('demo-panel').getByRole('button', { name: 'Admin' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('tab', { name: 'Statistiques' }).click();
    await expect(page.getByTestId('analytics')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
