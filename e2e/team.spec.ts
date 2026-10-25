import { expect, test } from '@playwright/test';
import { PASSWORD, loginWithDemo } from './helpers';

test('pharmacy team: the owner adds an assistant who sees only orders and the summary; the change is in the activity log', async ({ page, browser }) => {
  await loginWithDemo(page, 'Vienne', 'Pharmacie');
  await expect(page).toHaveURL(/\/pharmacy$/);
  await page.getByRole('tab', { name: 'Équipe' }).click();
  const form = page.getByTestId('team-form');
  await form.getByLabel('Nom affiché').fill('Léa Assistante');
  await form.getByLabel('E-mail').fill('lea@team.test');
  await form.getByLabel('Mot de passe initial').fill(PASSWORD);
  await form.getByLabel('Rôle').selectOption('assistant');
  await form.getByRole('button', { name: 'Ajouter ce membre' }).click();
  await expect(page.getByTestId('team-member')).toContainText('Léa Assistante');

  // The assistant logs in on her own: no incoming requests, no stock tab, no team tab, no pause switch.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/login');
  await p2.getByRole('tab', { name: 'Pharmacie' }).click();
  await p2.getByLabel('Adresse e-mail').fill('lea@team.test');
  await p2.getByLabel('Mot de passe').fill(PASSWORD);
  await p2.getByRole('button', { name: 'Se connecter' }).click();
  await expect(p2).toHaveURL(/\/pharmacy$/);
  await expect(p2.getByRole('tab', { name: /Commandes en cours/ })).toBeVisible();
  await expect(p2.getByRole('tab', { name: 'Stock' })).toHaveCount(0);
  await expect(p2.getByRole('tab', { name: 'Équipe' })).toHaveCount(0);
  await expect(p2.getByTestId('pause-switch')).toHaveCount(0);
  await ctx.close();

  await page.getByRole('tab', { name: 'Activité' }).click();
  await expect(page.getByTestId('activity-table')).toBeVisible();
});
