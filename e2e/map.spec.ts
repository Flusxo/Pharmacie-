import { expect, test, type Page } from '@playwright/test';
import { apiAs, loginWithDemo } from './helpers';

// A valid 1×1 PNG, served for every tile of the test tile host.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const WITH_TILES = 'http://localhost:5175';

async function loginAlice(page: Page, origin = '') {
  if (origin) {
    await page.goto(`${origin}/login`);
    await page.getByTestId('demo-panel').getByRole('button', { name: 'Alice — Tournon' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).click();
  } else {
    await loginWithDemo(page, 'Alice — Tournon');
  }
  await expect(page).toHaveURL(/\/home$/);
}

test.describe('map (section 10)', () => {
  test('without a tile key: clear message, attribution, pins and list still work and stay in sync', async ({ page }) => {
    const tileRequests: string[] = [];
    page.on('request', (r) => {
      if (/tile|openstreetmap|cartocdn|maptiler/i.test(r.url())) tileRequests.push(r.url());
    });
    await loginAlice(page);
    await page.goto('/map');
    const map = page.getByTestId('map');
    await expect(map.getByTestId('map-fallback')).toContainText('VITE_MAP_TILE_URL');
    await expect(map.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(map.locator('.leaflet-control-attribution')).toContainText('© MapTiler © OpenStreetMap contributors');
    expect(tileRequests, 'no default tile server may be contacted').toEqual([]);

    // Radius slider: 30 km shows more pharmacies than 15 km.
    await expect(page.getByTestId('map-list-item')).toHaveCount(1);
    await page.getByLabel(/Rayon/).fill('30');
    await expect(page.getByTestId('map-list-item')).toHaveCount(4); // Tournon, Valence, Romans, Étoile
    await expect(map.locator('.leaflet-marker-icon[title^="Pharmacie"]')).toHaveCount(4);

    // Pin -> list highlight.
    await map.locator('.leaflet-marker-icon[title="Pharmacie Victor Hugo"]').click();
    await expect(page.getByTestId('map-list-item').filter({ hasText: 'Pharmacie Victor Hugo' })).toHaveAttribute('aria-current', 'true');
    // List -> popup on the map.
    await page.getByTestId('map-list-item').filter({ hasText: 'Pharmacie de la Tour Jacquemart' }).click();
    await expect(map.getByTestId('map-popup').filter({ hasText: 'Pharmacie de la Tour Jacquemart' })).toBeVisible();
  });

  test('with a tile URL: tile requests return 200, no fallback, pins render', async ({ page }) => {
    await page.route('https://tiles.e2e.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const statuses: number[] = [];
    page.on('response', (r) => {
      if (r.url().startsWith('https://tiles.e2e.test/')) statuses.push(r.status());
    });
    await loginAlice(page, WITH_TILES);
    await page.goto(`${WITH_TILES}/map`);
    const map = page.getByTestId('map');
    await expect(map.locator('.leaflet-tile-loaded').first()).toBeVisible();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s) => s === 200)).toBe(true);
    await expect(map.getByTestId('map-fallback')).toHaveCount(0);
    await expect(map.locator('.leaflet-marker-icon[title^="Pharmacie"]').first()).toBeVisible();
    await expect(map.locator('.leaflet-control-attribution')).toContainText('MapTiler');
  });

  test('with a tile URL whose tiles fail (e.g. invalid key): fallback with Retry, pins still there', async ({ page }) => {
    await page.route('https://tiles.e2e.test/**', (route) => route.fulfill({ status: 403, body: 'Invalid key' }));
    await loginAlice(page, WITH_TILES);
    await page.goto(`${WITH_TILES}/map`);
    const map = page.getByTestId('map');
    await expect(map.getByTestId('map-fallback')).toBeVisible();
    await expect(map.locator('.leaflet-marker-icon[title^="Pharmacie"]').first()).toBeVisible();
  });

  test('location permission denied: the app explains and offers the address field', async ({ page }) => {
    await loginAlice(page);
    await page.goto('/map');
    await page.getByRole('button', { name: 'Utiliser ma position' }).click();
    await expect(page.getByText('Position refusée ou indisponible')).toBeVisible();
    await expect(page.getByLabel('Adresse ou code postal')).toBeVisible();
    // The map and list keep working with the saved address.
    await expect(page.getByTestId('map-list-item').first()).toBeVisible();
  });

  test('medicine details: stock pins and "Choose this pharmacy" from the popup open the request flow', async ({ page }) => {
    await loginAlice(page);
    await page.getByTestId('search-input').fill('Doliprane 1000');
    await page.getByTestId('search-input').press('Enter');
    await page.getByTestId('medicine-card').filter({ hasText: 'Doliprane 1000 mg' }).click();
    const map = page.getByTestId('map');
    await expect(map.locator('.pin-ok').first()).toBeVisible();
    await expect(map.locator('.pin-off').first()).toBeVisible(); // Étoile has 0 in stock
    await map.locator('.leaflet-marker-icon[title="Pharmacie du Rhône — En stock"]').click();
    await map.getByTestId('map-popup').getByRole('button', { name: 'Choisir cette pharmacie' }).click();
    await expect(page.getByTestId('request-sheet')).toContainText('Pharmacie du Rhône');
  });

  test('order tracking shows the simulated delivery map', async ({ page }) => {
    await loginAlice(page);
    const alice = await apiAs('alice@pharmacie.test');
    const orders = await alice.call<{ items: { id: string; status: string }[] }>('GET', '/patient/orders');
    const preparing = orders.items.find((o) => o.status === 'preparing')!;
    await page.goto(`/orders/${preparing.id}`);
    const section = page.getByRole('region', { name: 'Suivi simulé' });
    await expect(section).toBeVisible();
    await expect(section.locator('.leaflet-marker-icon[title="Livreur (simulé)"]')).toBeVisible();
    await expect(section.locator('.leaflet-marker-icon[title="Adresse de livraison"]')).toBeVisible();
    await alice.ctx.dispose();
  });
});
