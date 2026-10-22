import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Scrolls so that a fraction of the step list sits at 60 % of the viewport (the scroll trigger line). */
async function scrollSteps(page: Page, fraction: number) {
  await page.evaluate((f) => {
    const el = document.querySelector('.how-steps') as HTMLElement;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - window.innerHeight * 0.6 + el.offsetHeight * f, behavior: 'instant' });
  }, fraction);
}

test.describe('How it works (scroll-driven walkthrough)', () => {
  test('scrolling walks through the 5 steps, moves objects along the links and fills the tracker', async ({ page }) => {
    await page.goto('/how-it-works');
    await expect(page.getByTestId('sim-note')).toContainText('paiements et la livraison sont simulés');
    await expect(page.getByTestId('how-step')).toHaveCount(5);
    const stage = page.getByTestId('flow-stage');
    const seen: string[] = [];
    for (const f of [0.05, 0.25, 0.45, 0.65, 0.85, 0.995]) {
      await scrollSteps(page, f);
      await expect
        .poll(async () => Number(await stage.getAttribute('data-step')))
        .toBeGreaterThanOrEqual(Math.min(5, Math.floor(f * 5) + 1));
      seen.push((await stage.getAttribute('data-step'))!);
      await expect(page.locator('.how-step[aria-current="step"]')).toHaveCount(1);
    }
    expect(new Set(seen).size).toBe(5);
    // A request travels to the pharmacy during step 2, the delivery bag at the end; the tracker reaches "Delivered".
    await scrollSteps(page, 0.32);
    await expect(stage.locator('.flow-traveller[data-kind="request"]')).toHaveCount(1);
    await scrollSteps(page, 0.995);
    await expect(stage).toHaveAttribute('data-tracker', '5');
    await expect(stage.locator('.flow-tracker li.done')).toHaveCount(5);
    await expect(stage.locator('.flow-link.active')).toHaveCount(1);
    // Doctor / pharmacy sections and the FAQ follow the walkthrough.
    await expect(page.getByRole('heading', { name: 'Et les médecins ?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Et les pharmacies ?' })).toBeVisible();
  });

  test('with reduced motion every step shows its end state (nothing travels)', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5174', reducedMotion: 'reduce', locale: 'fr-FR' });
    await ctx.addInitScript(() => localStorage.setItem('counter.graphics', 'off'));
    const page = await ctx.newPage();
    await page.goto('/how-it-works');
    await scrollSteps(page, 0.25);
    const stage = page.getByTestId('flow-stage');
    await expect(stage).toHaveAttribute('data-step', '2');
    // End of step 2: the request is at the pharmacy (end of the counter. → pharmacy link).
    const t1 = await stage.locator('.flow-traveller').getAttribute('transform');
    await scrollSteps(page, 0.3);
    await expect(stage).toHaveAttribute('data-step', '2');
    expect(await stage.locator('.flow-traveller').getAttribute('transform')).toBe(t1);
    await ctx.close();
  });
});
