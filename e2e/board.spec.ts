import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

test('Today board: requests wait, an accepted order moves one valid step at a time by button or by drag, and the reorder list exports', async ({ page }) => {
  const patient = await apiAs('camille@pharmacie.test');
  const romans = await apiAs('pharmacie.romans@pharmacie.test');
  const me = await romans.call<{ user: { id: string } }>('GET', '/auth/me');
  const meds = await patient.call<{ items: { id: string; name: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await patient.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  await patient.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });

  await loginWithDemo(page, 'Romans', 'Pharmacie');
  await page.getByRole('tab', { name: 'Aujourd’hui' }).click();
  const board = page.getByTestId('today-board');
  await expect(board.getByRole('heading', { name: /Demandes en attente/ })).toContainText('1');
  await board.getByRole('button', { name: 'Ouvrir les demandes' }).click();
  await page.getByTestId('incoming-request').first().getByRole('button', { name: 'Accepter' }).click();
  await page.getByRole('tab', { name: 'Aujourd’hui' }).click();

  // The demo data already has orders in some columns: compare counts.
  const toPrepare = page.getByTestId('board-accepted');
  const preparing = page.getByTestId('board-preparing');
  const ready = page.getByTestId('board-ready');
  const cards = (col: ReturnType<typeof page.getByTestId>) => col.getByTestId('board-card');
  await expect(cards(toPrepare).first()).toBeVisible();
  const n = { accepted: await cards(toPrepare).count(), preparing: await cards(preparing).count(), ready: await cards(ready).count() };
  expect(n.accepted).toBeGreaterThanOrEqual(1);
  // The button moves a card forward one step.
  await cards(toPrepare).first().getByTestId('board-next').click();
  await expect(cards(preparing)).toHaveCount(n.preparing + 1);
  await expect(cards(toPrepare)).toHaveCount(n.accepted - 1);
  // Dragging works for the next valid step.
  await cards(preparing).first().dragTo(ready);
  await expect(cards(ready)).toHaveCount(n.ready + 1);
  await expect(cards(preparing)).toHaveCount(n.preparing);
  await expect(cards(ready).first().getByRole('link', { name: 'Retrait' })).toBeVisible();
  // A ready card cannot be dragged backwards.
  await cards(ready).first().dragTo(toPrepare);
  await expect(cards(ready)).toHaveCount(n.ready + 1);
});

test('reorder list: the low-stock list on the daily summary exports a CSV', async ({ page }) => {
  await loginWithDemo(page, 'Étoile', 'Pharmacie');
  await page.getByRole('tab', { name: 'Stock' }).click();
  // Make one medicine low: set its threshold above its quantity.
  const row = page.getByTestId('stock-row').first();
  await row.getByLabel(/seuil|threshold/i).fill('9999');
  await row.getByRole('button', { name: /Enregistrer|Mettre à jour/ }).click();
  await page.getByRole('tab', { name: 'Résumé du jour' }).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('reorder-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('reorder-list.csv');
});
