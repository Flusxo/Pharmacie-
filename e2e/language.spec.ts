import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { apiAs, loginByToken } from './helpers';

/** Switches with the top-bar selector and checks that the page text really changes. */
async function switchAndCheck(page: Page, to: 'en' | 'fr', expectText: RegExp) {
  await page.locator('header select').first().selectOption(to);
  await expect(page.locator('html')).toHaveAttribute('lang', to);
  await expect(page.locator('main')).toContainText(expectText);
}

const PAGES: { who: string; path: string; fr: RegExp; en: RegExp }[] = [
  { who: 'alice', path: '/home', fr: /Bonjour Alice/, en: /Hello Alice/ },
  { who: 'alice', path: '/search?q=doli', fr: /Rechercher un médicament/, en: /Search for a medicine/ },
  { who: 'alice', path: '/requests', fr: /Mes demandes/, en: /My requests/ },
  { who: 'alice', path: '/map', fr: /Position utilisée/, en: /Location used/ },
  { who: 'alice', path: '/profile', fr: /Mon compte/, en: /My account/ },
  { who: 'pharmacie.tournon', path: '/pharmacy', fr: /Tableau de bord pharmacie/, en: /Pharmacy dashboard/ },
  { who: 'dr.martin', path: '/doctor', fr: /Tableau de bord médecin/, en: /Doctor dashboard/ },
  { who: 'admin', path: '/admin', fr: /Espace équipe/, en: /Staff area/ },
];

test.describe('language switch', () => {
  for (const p of PAGES) {
    test(`${p.path} (${p.who}) switches French ⇄ English`, async ({ page }) => {
      await loginByToken(page, `${p.who}@pharmacie.test`);
      await page.goto(p.path);
      await expect(page.locator('main')).toContainText(p.fr);
      // The account language arrives with the first /auth/me; a choice made before it would be overwritten.
      await page.waitForLoadState('networkidle');
      const me = await apiAs(`${p.who}@pharmacie.test`);
      const account = () => me.call<{ user: { language: string } }>('GET', '/auth/me').then((r) => r.user.language);
      await switchAndCheck(page, 'en', p.en);
      // Wait for the account to follow before switching back: two saves in flight can land in the wrong order.
      await expect.poll(account).toBe('en');
      await switchAndCheck(page, 'fr', p.fr);
      // The account follows the switch; wait until it is back to French so other tests start in French.
      await expect.poll(account).toBe('fr');
      await me.ctx.dispose();
    });
  }

  test('login page, medicine details (database text) and API errors follow the language', async ({ page }) => {
    await page.goto('/login');
    await switchAndCheck(page, 'en', /Log in/);
    await page.getByLabel('Email').fill('alice@pharmacie.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    await page.locator('header select').first().selectOption('fr');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.');

    await loginByToken(page, 'alice@pharmacie.test');
    await page.goto('/search?q=Doliprane');
    await page.getByTestId('medicine-card').first().click();
    await expect(page.locator('main')).toContainText('Antalgique et antipyrétique');
    await switchAndCheck(page, 'en', /Pain reliever and fever reducer/);
    await page.locator('header select').first().selectOption('fr');
    const me = await apiAs('alice@pharmacie.test');
    await expect.poll(async () => (await me.call<{ user: { language: string } }>('GET', '/auth/me')).user.language).toBe('fr');
    await me.ctx.dispose();
  });

  test('the choice is saved on the account and comes back on another browser', async ({ page, browser }) => {
    const bruno = await apiAs('bruno@pharmacie.test');
    await bruno.call('PATCH', '/auth/me/preferences', { language: 'fr' });
    await loginByToken(page, 'bruno@pharmacie.test');
    await page.goto('/home');
    await page.locator('header select').first().selectOption('en');
    await expect(page.locator('main')).toContainText('Hello Bruno');
    await expect.poll(async () => (await bruno.call<{ user: { language: string } }>('GET', '/auth/me')).user.language).toBe('en');

    // A fresh browser (no saved choice) opens in the account's language.
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', locale: 'fr-FR' });
    await ctx.addInitScript(() => {
      localStorage.setItem('counter.graphics', 'off');
      localStorage.setItem('counter.tour', 'done');
      localStorage.setItem('counter.tour.doctor', 'done');
      localStorage.setItem('counter.tour.pharmacy', 'done');
      localStorage.setItem('counter.consent', 'essential');
    });
    const other = await ctx.newPage();
    await loginByToken(other, 'bruno@pharmacie.test');
    await other.goto('/home');
    await expect(other.locator('main')).toContainText('Hello Bruno');
    await expect(other.locator('html')).toHaveAttribute('lang', 'en');
    await bruno.call('PATCH', '/auth/me/preferences', { language: 'fr' });
    await bruno.ctx.dispose();
    await ctx.close();
  });
});
