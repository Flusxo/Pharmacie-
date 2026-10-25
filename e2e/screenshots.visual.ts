import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'docs', 'screenshots');

/** Forces the High tier (an explicit choice is never downgraded by the frame-rate guard). */
async function prepare(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((th) => {
    localStorage.setItem('counter.graphics', 'high');
    localStorage.setItem('counter.theme', th);
    localStorage.setItem('counter.tour', 'done');
    localStorage.setItem('counter.tour.doctor', 'done');
    localStorage.setItem('counter.tour.pharmacy', 'done');
  }, theme);
}
async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('demo-panel').getByRole('button', { name: 'Alice — Tournon' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/home$/);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const SIZES = [
  [1440, 900, 'desktop'],
  [390, 844, 'mobile'],
] as const;

for (const [w, h, tag] of SIZES) {
  test.describe(tag, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await prepare(page);
      await login(page);
    });

    test(`home hero ${tag}`, async ({ page }) => {
      await expect(page.getByTestId('root-stage')).toHaveClass(/ready/, { timeout: 180_000 });
      await page.waitForTimeout(3000);
      await shot(page, `hero-start-${tag}`);
      const total = await page.evaluate(() => document.querySelector('.hero-3d')!.getBoundingClientRect().height - window.innerHeight);
      for (const [p, name] of [
        [0.5, 'hero-capsules'],
        [1, 'hero-shelf'],
      ] as const) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), total * p);
        await page.waitForTimeout(4000);
        await shot(page, `${name}-${tag}`);
      }
    });

    for (const [url, name] of [
      ['/search?q=para', 'bg-search'],
      ['/requests', 'bg-requests'],
      ['/profile', 'bg-account'],
    ] as const) {
      test(`background ${name} ${tag}`, async ({ page }) => {
        await page.goto(url);
        await expect(page.getByTestId('root-stage')).toHaveClass(/ready/, { timeout: 180_000 });
        await page.waitForTimeout(2500);
        await shot(page, `${name}-${tag}`);
      });
    }

    for (const [q, name] of [
      ['Hélicidine', 'viewer-syrup'],
      ['Biafine', 'viewer-cream'],
      ['Ventoline 100', 'viewer-inhaler'],
      ['Strepsils', 'viewer-blister'],
      ['Dafalgan', 'viewer-pillbottle'],
    ] as const) {
      test(`viewer ${name} ${tag}`, async ({ page }) => {
        await page.goto(`/search?q=${encodeURIComponent(q)}`);
        await page.getByTestId('medicine-card').first().click();
        await expect(page.getByTestId('product-visual')).toHaveClass(/ready/, { timeout: 180_000 });
        await page.waitForTimeout(3000);
        await page.getByTestId('product-visual').screenshot({ path: path.join(OUT, `${name}-${tag}.png`), timeout: 120_000 });
      });
    }
  });
}
