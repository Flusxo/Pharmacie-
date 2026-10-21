import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:4100/api';
export const PASSWORD = 'Password123!';

/** Logs in through the real login page using the dev-only demo panel. */
export async function loginWithDemo(page: Page, demoLabel: string, tab?: 'Médecin' | 'Pharmacie') {
  await page.goto('/login');
  if (tab) await page.getByRole('tab', { name: tab }).click();
  await page.getByTestId('demo-panel').getByRole('button', { name: demoLabel }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** API client logged in as someone (used to play the other side of a flow). */
export async function apiAs(
  email: string,
): Promise<{ ctx: APIRequestContext; call: <T>(method: string, path: string, data?: unknown) => Promise<T> }> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), await res.text()).toBe(200);
  const { token } = (await res.json()) as { token: string };
  const call = async <T>(method: string, path: string, data?: unknown): Promise<T> => {
    const r = await ctx.fetch(`${API}${path}`, { method, data, headers: { Authorization: `Bearer ${token}` } });
    const body = await r.text();
    expect(r.ok(), `${method} ${path}: ${r.status()} ${body}`).toBeTruthy();
    return (body ? JSON.parse(body) : null) as T;
  };
  return { ctx, call };
}

/** The UI must never present medicines as something to buy (hard rule 1). */
export async function expectNoBuyWording(page: Page) {
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const word of ['buy now', 'add to cart', 'acheter', 'ajouter au panier', 'panier']) expect(text).not.toContain(word);
}
