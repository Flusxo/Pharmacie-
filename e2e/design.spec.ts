import { expect, test } from './fixtures';

const PAGES = ['/', '/how-it-works', '/patients', '/pharmacies', '/doctors', '/about', '/contact', '/faq', '/privacy', '/terms'];
const BANNED =
  /Toutes les formes, toutes les couleurs|Every form, every colour|Images de synthèse issues|Pictures rendered from our own 3D scenes|All shapes, all colou?rs/i;

test.describe('design: no gallery section, no picture frames, hero from the first frame', () => {
  for (const lang of ['fr', 'en'] as const) {
    test(`public pages in ${lang}: the "all shapes, all colours" section and every framed picture are gone`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem('counter.lang', l), lang);
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        const text = await page.locator('body').innerText();
        expect(text, `${path} (${lang})`).not.toMatch(BANNED);
        for (const sel of ['.gallery', '[data-testid="gallery"]', '.picture-band', '.picture.framed']) {
          await expect(page.locator(sel), `${sel} on ${path}`).toHaveCount(0);
        }
      }
    });
  }

  test('the hero is the real scene from the first frame (a still of the same objects), also with the 3D off', async ({ page }) => {
    for (const path of ['/', '/patients', '/login']) {
      await page.goto(path);
      const still = page.getByTestId('hero-still');
      await expect(still, path).toHaveCount(1);
      await expect(still.locator('img')).toHaveAttribute('src', /\/renders\/hero-.*-960\.webp$/);
      // the picture really loads (not a broken link)
      await expect.poll(() => still.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 100)).toBe(true);
    }
  });

  test('explanation steps without live 3D show a transparent cut-out beside each step, never a framed picture', async ({ page }) => {
    await page.goto('/patients');
    await expect(page.getByTestId('story-live-step')).toHaveCount(4);
    await expect(page.locator('.story-live-fallback .picture.cutout')).toHaveCount(4);
    await expect(page.locator('.picture.framed')).toHaveCount(0);
  });

  test('the demo counters show the real numbers at once and keep them (never a stuck 0)', async ({ page }) => {
    await page.goto('/');
    const stats = page.locator('.stat strong');
    await stats.first().scrollIntoViewIfNeeded();
    await expect.poll(async () => (await stats.allInnerTexts()).join(' ')).toBe('50 8 3 30');
  });
});
