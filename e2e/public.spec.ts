import { expect, test } from './fixtures';
import { expectNoBuyWording, loginByToken } from './helpers';

const PAGES: [string, RegExp][] = [
  ['/', /Votre médicament, dans la pharmacie de votre choix/],
  ['/how-it-works', /De la recherche à la livraison/],
  ['/patients', /Trouvez votre médicament sans faire le tour/],
  ['/pharmacies', /Des demandes de patients proches/],
  ['/doctors', /Préparez la demande, votre patient choisit/],
  ['/about', /Un prototype pour rapprocher/],
  ['/contact', /Écrivez-nous/],
  ['/faq', /Questions fréquentes/],
  ['/privacy', /Confidentialité/],
  ['/terms', /Conditions d’utilisation/],
];

test.describe('public website', () => {
  test('every public page loads with the same top bar (big "Log in" + "Create account") and footer', async ({ page }) => {
    for (const [path, title] of PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      const login = page.getByTestId('login-button');
      await expect(login).toBeVisible();
      await expect(page.getByRole('link', { name: 'Créer un compte' }).first()).toBeVisible();
      await expect(page.getByTestId('prototype-notice')).toBeVisible();
      await expect(page.getByTestId('footer-contact')).toContainText('fictive');
      await expectNoBuyWording(page);
    }
    // The login button is the biggest control in the bar.
    const box = await page.getByTestId('login-button').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('navigation links and the login button work', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Navigation du site' }).getByRole('link', { name: 'Pharmacies' }).click();
    await expect(page).toHaveURL(/\/pharmacies$/);
    await page.getByTestId('login-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  });

  test('on a phone: the login button stays in the bar and the menu opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('login-button')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation du site' })).toBeHidden();
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page.locator('#pub-menu').getByRole('link', { name: 'FAQ' }).click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.locator('#pub-menu')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('pages are bilingual', async ({ page }) => {
    await page.goto('/pharmacies');
    await page.locator('header select').first().selectOption('en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Requests from nearby patients/);
    await expect(page.getByTestId('login-button')).toHaveText(/Log in/);
    await page.locator('header select').first().selectOption('fr');
  });

  test('contact form: validation, success, then staff see and handle the message', async ({ page }) => {
    await page.goto('/contact');
    const form = page.getByTestId('contact-form');
    await form.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(form.getByText('Ce champ est obligatoire.')).toBeVisible();
    await expect(form.getByText('Saisissez une adresse e-mail valide.')).toBeVisible();
    await expect(form.getByText('Merci de cocher cette case.')).toBeVisible();

    const subject = `E2E question ${Date.now()}`;
    await form.getByLabel('Votre nom').fill('Camille Essai');
    await form.getByLabel('Votre adresse e-mail').fill('camille.essai@example.com');
    await form.getByLabel('Vous êtes').selectOption('pharmacy');
    await form.getByLabel('Objet').fill(subject);
    await form.getByLabel('Message').fill('Bonjour, comment notre officine peut-elle rejoindre la démo ?');
    await form.getByLabel(/Je confirme ne pas envoyer/).check();
    await form.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByTestId('contact-sent')).toContainText('Message envoyé');

    await loginByToken(page, 'support@pharmacie.test');
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Messages' }).click();
    const msg = page.getByTestId('contact-message').filter({ hasText: subject });
    await expect(msg).toContainText('camille.essai@example.com');
    await msg.getByRole('button', { name: 'Marquer comme traité' }).click();
    await expect(page.getByTestId('contact-message').filter({ hasText: subject })).toHaveCount(0);
    await page.locator('#msg-status').selectOption('handled');
    await expect(page.getByTestId('contact-message').filter({ hasText: subject })).toContainText('Traité par support@pharmacie.test');
  });
});
