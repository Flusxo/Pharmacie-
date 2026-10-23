import { expect, test } from '@playwright/test';
import { apiAs, loginByToken } from './helpers';

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

  test('ONE persistent canvas: same element and visible across 11 pages of client-side navigation, back after a refresh', async ({
    page,
  }) => {
    test.setTimeout(400_000);
    const stage = page.getByTestId('root-stage');
    const mark = () =>
      page.evaluate(
        () => ((window as unknown as { __c: Element | null }).__c = document.querySelector('[data-testid="root-stage"] canvas')),
      );
    const same = () =>
      page.evaluate(
        () => (window as unknown as { __c: Element | null }).__c === document.querySelector('[data-testid="root-stage"] canvas'),
      );
    const visible = () =>
      page.evaluate(() => {
        const c = document.querySelector('[data-testid="root-stage"] canvas') as HTMLElement | null;
        const holder = c?.closest('.page-bg-canvas') as HTMLElement | null;
        return !!c && c.getBoundingClientRect().width > 100 && !!holder && getComputedStyle(holder).opacity === '1';
      });
    const check = async (scene: string) => {
      await expect(stage).toHaveAttribute('data-scene', scene);
      expect(await same(), `canvas replaced on ${scene}`).toBe(true);
      await expect.poll(visible, { message: `canvas hidden on ${scene}` }).toBe(true);
    };

    // The form is usable at once, whatever the 3D layer is doing.
    await page.goto('/login');
    await page.getByLabel('Adresse e-mail').fill('alice@pharmacie.test');
    await expect(page.getByLabel('Adresse e-mail')).toHaveValue('alice@pharmacie.test');

    await page.goto('/');
    await expect(stage).toHaveAttribute('data-mode', '3d');
    await expect(stage.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
    await expect.poll(visible, { timeout: 90_000 }).toBe(true);
    await mark();
    const nav = page.getByRole('navigation', { name: 'Navigation du site' });
    for (const [link, scene] of [
      ['Pharmacies', 'pharmacies'],
      ['Médecins', 'doctors'],
      ['À propos', 'about'],
      ['FAQ', 'faq'],
      ['Contact', 'contact'],
    ] as const) {
      await nav.getByRole('link', { name: link }).click();
      await check(scene);
    }
    await page.getByTestId('login-button').click();
    await check('auth');
    await page.getByTestId('demo-panel').getByRole('button', { name: 'Alice — Tournon' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await check('app-home');
    const main = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const [link, scene] of [
      ['Rechercher', 'app-search'],
      ['Carte', 'app-map'],
      ['Mes demandes', 'app-requests'],
      ['Profil', 'app-account'],
    ] as const) {
      await main.getByRole('link', { name: link }).click();
      await check(scene);
    }
    expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);

    // A refresh builds it again (a new page), and it is visible again.
    await page.reload();
    await expect(stage.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
    await expect.poll(visible, { timeout: 90_000 }).toBe(true);
    await expect(stage).toHaveAttribute('data-scene', 'app-account');

    // Graphics Off: no canvas, the still art on public pages.
    await page.evaluate(() => localStorage.setItem('counter.graphics', 'off'));
    await page.goto('/');
    await expect(stage).toHaveAttribute('data-mode', 'static');
    await expect(stage.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.pub-hero-visual .hero-art')).toBeVisible();
  });

  test('every page has its own scene: sign-up, password recovery and privacy are not the login scene', async ({ page }) => {
    const stage = page.getByTestId('root-stage');
    await page.goto('/login');
    await expect(stage).toHaveAttribute('data-scene', 'auth');
    for (const [path, scene] of [
      ['/register', 'register'],
      ['/forgot-password', 'recover'],
      ['/privacy', 'privacy'],
      ['/terms', 'terms'],
    ] as const) {
      await page.evaluate((p) => {
        history.pushState({}, '', p);
        dispatchEvent(new PopStateEvent('popstate'));
      }, path);
      await expect(stage).toHaveAttribute('data-scene', scene);
      await expect(stage.locator('canvas')).toHaveCount(1);
    }
  });

  test('product viewer has a dedicated model per form: carton with blister (exploded view), nasal spray and dropper bottle', async ({
    page,
  }) => {
    await loginByToken(page, 'alice@pharmacie.test');
    for (const [query, exploded] of [
      ['Doliprane', true],
      ['Physiomer', false],
      ['ZymaD', false],
    ] as const) {
      await page.goto(`/search?q=${query}`);
      await page.getByTestId('medicine-card').first().click();
      const viewer = page.getByTestId('product-visual');
      await expect(viewer).toHaveAttribute('data-mode', '3d');
      await expect(viewer.locator('canvas')).toHaveCount(1, { timeout: 90_000 });
      await expect(page.getByRole('button', { name: 'Vue éclatée' })).toHaveCount(exploded ? 1 : 0);
      if (exploded) await page.getByRole('button', { name: 'Vue éclatée' }).click();
      // the stage behind is still the one persistent canvas: root + this viewer, never more
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);
    }
  });

  test('delivery scene is labelled "Suivi simulé" on the persistent canvas; the pharmacy stock has a 3D shelf', async ({
    page,
    browser,
  }) => {
    const alice = await apiAs('alice@pharmacie.test');
    const pharmacy = await apiAs('pharmacie.tournon@pharmacie.test');
    const found = await alice.call<{ items: { id: string }[] }>('GET', '/medicines?q=Dafalgan');
    const medicineId = found.items[0].id;
    const near = await alice.call<{ items: { id: string; name: string }[] }>(
      'GET',
      `/medicines/${medicineId}/pharmacies?lat=45.07&lon=4.83`,
    );
    const pharmacyId = near.items.find((p) => p.name === 'Pharmacie du Rhône')!.id;
    const created = await alice.call<{ id: string }>('POST', '/patient/requests', { items: [{ medicineId, quantity: 1 }] });
    await alice.call('POST', `/patient/requests/${created.id}/choose`, { pharmacyId });
    const accepted = await pharmacy.call<{ orderId: string }>('POST', `/pharmacy/requests/${created.id}/accept`);

    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto(`/orders/${accepted.orderId}`);
    await expect(page.getByTestId('root-stage')).toHaveAttribute('data-scene', 'app-tracking');
    await expect(page.getByTestId('sim-tag-3d')).toContainText('Suivi simulé', { timeout: 120_000 });

    const ph = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
    await ph.addInitScript(() => {
      localStorage.setItem('counter.graphics', 'medium');
      localStorage.setItem('counter.tour', 'done');
    });
    const p2 = await ph.newPage();
    await loginByToken(p2, 'pharmacie.tournon@pharmacie.test');
    await p2.goto('/pharmacy');
    await p2.getByRole('tab', { name: /Stock/ }).click();
    await p2.getByRole('tab', { name: 'Étagère 3D' }).click();
    await expect(p2.getByTestId('shelf-visual').locator('canvas')).toHaveCount(1, { timeout: 120_000 });
    expect(await p2.locator('canvas').count()).toBeLessThanOrEqual(2);
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
      await expect(page.getByTestId('root-stage')).toHaveAttribute('data-mode', '3d');
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
    await expect(page.getByTestId('root-stage')).toHaveAttribute('data-mode', 'static');
    await page.goto('/home');
    await expect(page.getByTestId('root-stage').locator('canvas')).toHaveCount(0);
    await expect(page.locator('.hero-poster')).toBeVisible();
  });
});
