import { expect, test } from './fixtures';
import { apiAs, loginWithDemo } from './helpers';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 3)]);

test('prescription: the patient attaches a file to a request, only the chosen pharmacy opens it, a wrong file type is refused', async ({ page, browser }) => {
  const alice = await apiAs('alice@pharmacie.test');
  const meds = await alice.call<{ items: { id: string }[] }>('GET', '/medicines?q=Doliprane');
  const req = await alice.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId: meds.items[0].id, quantity: 1 }] });
  const tournon = await apiAs('pharmacie.tournon@pharmacie.test');
  const me = await tournon.call<{ user: { id: string } }>('GET', '/auth/me');
  await alice.call('POST', `/patient/requests/${req.id}/choose`, { pharmacyId: me.user.id, acceptPartial: false });

  await loginWithDemo(page, 'Alice — Tournon');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/requests/${req.id}`);
  const files = page.getByTestId('rx-files');
  // A text file is refused before it leaves the browser.
  await files.getByTestId('file-input').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('Choisissez une photo (JPEG, PNG, WebP) ou un PDF.')).toBeVisible();
  await files.getByTestId('file-input').setInputFiles({ name: 'ordonnance.png', mimeType: 'image/png', buffer: PNG });
  await expect(files.getByTestId('private-file')).toContainText('ordonnance.png');

  // The chosen pharmacy sees it on the incoming request, and can open it.
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
  await ctx.addInitScript(() => {
    localStorage.setItem('counter.graphics', 'off');
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
    localStorage.setItem('counter.consent', 'essential');
  });
  const ph = await ctx.newPage();
  await loginWithDemo(ph, 'Pharmacie du Rhône — Tournon', 'Pharmacie');
  // Open every incoming request of this patient (earlier tests may have left others): the one with the file shows it.
  const cards = ph.getByTestId('incoming-request').filter({ hasText: 'Alice M.' });
  await expect(cards.first()).toBeVisible();
  for (let i = 0; i < (await cards.count()); i++) await cards.nth(i).getByText('Ordonnance jointe par le patient').click();
  const file = ph.getByTestId('private-file').filter({ hasText: 'ordonnance.png' });
  await expect(file).toHaveCount(1);
  await file.getByRole('button', { name: 'Voir' }).click();
  await expect(ph.getByRole('img', { name: /ordonnance\.png/ })).toBeVisible();
  await ctx.close();

  // The patient can remove it.
  await files.getByRole('button', { name: 'Retirer' }).click();
  await expect(files.getByText('Aucun fichier.')).toBeVisible();
});
