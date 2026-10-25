import { expect, test } from './fixtures';

test('storage notice: shown once, says there is no tracking, stays dismissed; each page sets its title; sitemap and robots exist', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('consent-test')) {
      localStorage.removeItem('counter.consent');
      sessionStorage.setItem('consent-test', '1');
    }
  });
  await page.goto('/faq');
  const notice = page.getByTestId('consent');
  await expect(notice).toContainText('ni publicité ni suivi');
  await expect(page).toHaveTitle(/Questions fréquentes|FAQ/);
  await notice.getByRole('button', { name: 'Compris' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('consent')).toHaveCount(0);
  await page.goto('/contact');
  await expect(page).toHaveTitle(/Contact · counter\./);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('/privacy');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap:');
  const og = await request.get('/og.png');
  expect(og.headers()['content-type']).toContain('image/png');
});
