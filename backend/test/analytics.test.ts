import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { foldSmallGroups, MIN_GROUP } from '../src/services/analytics.js';

beforeAll(freshDb);

const as = async (who: string) => auth(await login(who));

describe('admin analytics', () => {
  it('every staff role can read the aggregated numbers; other roles cannot', async () => {
    for (const who of ['admin', 'support', 'moderator']) {
      const res = await api()
        .get('/api/admin/analytics?days=30')
        .set(await as(who));
      expect(res.status, who).toBe(200);
    }
    for (const who of ['alice', 'dr.martin', 'pharmacie.tournon']) {
      expect(
        (
          await api()
            .get('/api/admin/analytics')
            .set(await as(who))
        ).status,
        who,
      ).toBe(403);
    }
    expect((await api().get('/api/admin/analytics')).status).toBe(401);
  });

  it('returns counts, a daily series covering the whole period, and validates the period', async () => {
    const h = await as('admin');
    const res = await api().get('/api/admin/analytics?days=14').set(h);
    expect(res.body.days).toBe(14);
    expect(res.body.perDay).toHaveLength(14);
    expect(res.body.kpis.requests).toBeGreaterThan(0);
    expect(res.body.kpis.orders).toBeGreaterThan(0);
    expect(Array.isArray(res.body.ordersByStatus)).toBe(true);
    expect(res.body.payments.testMode).toBe(true);
    expect((await api().get('/api/admin/analytics?days=1').set(h)).status).toBe(400);
    expect((await api().get('/api/admin/analytics?days=9999').set(h)).status).toBe(400);
  });

  it('contains no personal data: no e-mail, no patient or doctor name, no address, no ids of people', async () => {
    const res = await api()
      .get('/api/admin/analytics?days=365')
      .set(await as('admin'));
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/@/); // no e-mail address
    for (const person of ['Alice', 'Bruno', 'Martin', 'Dupont']) expect(text, person).not.toContain(person);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/); // no uuid at all
    expect(text).not.toMatch(/latitude|longitude|address|phone|password|token/i);
  });

  it('folds groups smaller than the minimum into "other"', () => {
    const rows = [
      { label: 'A', count: 10 },
      { label: 'B', count: MIN_GROUP },
      { label: 'C', count: 1 },
      { label: 'D', count: 2 },
    ];
    expect(foldSmallGroups(rows)).toEqual([
      { label: 'A', count: 10 },
      { label: 'B', count: MIN_GROUP },
      { label: 'other', count: 3 },
    ]);
    // a rest smaller than the minimum is dropped, never shown on its own
    expect(
      foldSmallGroups([
        { label: 'A', count: 9 },
        { label: 'B', count: 1 },
      ]),
    ).toEqual([{ label: 'A', count: 9 }]);
  });
});
