import { test as base, expect } from '@playwright/test';

/**
 * Functional tests run with Graphics quality "Off" so software WebGL does not slow them down.
 * The 3D itself is covered by e2e/three.spec.ts (and screenshots by *.visual.ts).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('counter.graphics')) localStorage.setItem('counter.graphics', 'off');
    });
    await use(page);
  },
});
export { expect };
