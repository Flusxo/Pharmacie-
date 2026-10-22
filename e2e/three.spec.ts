import { expect, test } from '@playwright/test';
import { loginByToken } from './helpers';

/** The 3D layer itself, with Graphics quality "Medium" (software WebGL in headless Chromium). */
test.describe('3D layer', () => {
  test.beforeEach(async ({ page }) => {
    // Medium: real 3D without post-processing (headless Chromium renders WebGL in software).
    await page.addInitScript(() => {
      if (!localStorage.getItem('counter.graphics')) localStorage.setItem('counter.graphics', 'medium');
      localStorage.setItem('counter.tour', 'done');
    });
    test.setTimeout(240_000);
  });

  test('first page load does not download any 3D code', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    await page.waitForTimeout(1500);
    // The site background may start loading its own chunk after first paint; the heavy product/hero scenes must not.
    expect(scripts.filter((u) => /ProductScene|HeroScene|ExtraScenes/.test(u))).toEqual([]);
  });

  test('public site: one shared 3D layer, a composition per page; forms work while it loads; Off shows the still art', async ({ page }) => {
    await page.goto('/login');
    // The form is usable at once, whatever the 3D layer is doing.
    await page.getByLabel('Adresse e-mail').fill('alice@pharmacie.test');
    await expect(page.getByLabel('Adresse e-mail')).toHaveValue('alice@pharmacie.test');
    const layer = page.getByTestId('page-backdrop');
    await expect(layer).toHaveAttribute('data-scene', 'auth');

    await page.goto('/');
    await expect(layer).toHaveAttribute('data-scene', 'home');
    await expect(layer).toHaveAttribute('data-mode', '3d');
    await expect(layer.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
    await page.evaluate(() => ((window as unknown as { __c: Element | null }).__c = document.querySelector('.page-bg canvas')));
    // Client-side navigation keeps the same canvas (shared scene manager) and switches the composition.
    await page.getByRole('navigation', { name: 'Navigation du site' }).getByRole('link', { name: 'Pharmacies' }).click();
    await expect(layer).toHaveAttribute('data-scene', 'pharmacies');
    expect(
      await page.evaluate(() => (window as unknown as { __c: Element | null }).__c === document.querySelector('.page-bg canvas')),
    ).toBe(true);

    await page.evaluate(() => localStorage.setItem('counter.graphics', 'off'));
    await page.goto('/');
    await expect(layer).toHaveAttribute('data-mode', 'static');
    await expect(layer.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.pub-hero-visual .hero-art')).toBeVisible();
    await expect(page.locator('.pub-app')).not.toHaveClass(/pub-3d/);
  });

  test('medicine details: 3D viewer with canvas, 3D / Photo toggle and a text alternative', async ({ page }) => {
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto('/search?q=Hélicidine');
    await page.getByTestId('medicine-card').first().click();
    const viewer = page.getByTestId('product-visual');
    await expect(viewer).toHaveAttribute('data-mode', '3d');
    await expect(viewer.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
    await expect(viewer.getByRole('img', { name: /Hélicidine sirop/ }).first()).toBeAttached();
    await page.getByTestId('toggle-photo').click();
    await expect(viewer).toHaveAttribute('data-mode', 'photo');
    await expect(viewer.locator('canvas')).toHaveCount(0);
    await page.getByTestId('toggle-3d').click();
    await expect(viewer.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
  });

  test('every page has the background layer; with reduced motion the app still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginByToken(page, 'alice@pharmacie.test');
    for (const url of ['/search', '/requests', '/profile']) {
      await page.goto(url);
      await expect(page.getByTestId('site-bg')).toHaveAttribute('data-mode', '3d');
    }
    await page.goto('/search?q=Biafine');
    await page.getByTestId('medicine-card').first().click();
    await expect(page.getByTestId('product-visual')).toHaveClass(/ready/, { timeout: 60_000 });
    await expect(page.getByText('360°')).toHaveCount(0);
  });

  test('Graphics quality "Off" in the account page switches every 3D element to its static version', async ({ page }) => {
    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto('/profile');
    await page.getByTestId('graphics-quality').selectOption('off');
    await expect(page.getByTestId('site-bg')).toHaveAttribute('data-mode', 'static');
    await page.goto('/home');
    await expect(page.getByTestId('hero-visual')).toHaveAttribute('data-mode', 'static');
  });
});
