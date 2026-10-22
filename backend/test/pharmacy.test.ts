import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';
import { medicineId } from '../../db/src/index.js';

beforeAll(freshDb);

const CIP = (i: number) => `34009${String(3000000 + i * 1373).padStart(8, '0')}`;

describe('pharmacy inventory', () => {
  it('previews a CSV with per-row errors and refuses to apply it', async () => {
    const t = await login('pharmacie.tournon');
    const csv = ['cip13;quantity;price_eur', `${CIP(0)};40;2,10`, '123;5;1', `${CIP(1)};-2;1,95`, `${CIP(0)};3;1`].join('\n');
    const preview = await api().post('/api/pharmacy/inventory/csv').set(auth(t)).send({ csv, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body.errors).toBe(3);
    expect(preview.body.rows.map((r: { error: string | null }) => r.error)).toEqual([
      null,
      'cip13 must be 13 digits',
      'quantity must be a whole number ≥ 0',
      'this CIP13 appears twice',
    ]);
    expect(preview.body.rows[0]).toMatchObject({ name: 'Doliprane 1000 mg', quantity: 40, priceEur: 2.1 });
    const apply = await api().post('/api/pharmacy/inventory/csv').set(auth(t)).send({ csv, dryRun: false });
    expect(apply.status).toBe(400);
    expect(apply.body.error).toMatch(/Fix the 3 row/);
  });

  it('applies a valid CSV and records history', async () => {
    const t = await login('pharmacie.tournon');
    const csv = `cip13,quantity,price_eur,low_stock_threshold\n${CIP(0)},41,2.15,6\n${CIP(20)},7,5.5,`;
    const res = await api().post('/api/pharmacy/inventory/csv').set(auth(t)).send({ csv, dryRun: false });
    expect(res.body).toEqual({ dryRun: false, applied: 2 });
    const inv = await api().get('/api/pharmacy/inventory?q=Doliprane 1000').set(auth(t));
    expect(inv.body.items[0]).toMatchObject({ quantity: 41, priceEur: 2.15, lowStockThreshold: 6 });
    const hist = await api()
      .get(`/api/pharmacy/inventory/history?medicineId=${medicineId(0)}`)
      .set(auth(t));
    expect(hist.body.items[0]).toMatchObject({ newQty: 41, reason: 'csv' });
  });

  it('lists low stock only', async () => {
    const t = await login('pharmacie.tournon');
    await api()
      .put(`/api/pharmacy/inventory/${medicineId(3)}`)
      .set(auth(t))
      .send({ quantity: 2, priceEur: 3.5, lowStockThreshold: 5 });
    const low = await api().get('/api/pharmacy/inventory?low=1').set(auth(t));
    expect(low.body.items.length).toBeGreaterThan(0);
    expect(low.body.items.every((i: { low: boolean }) => i.low)).toBe(true);
    expect(low.body.items.map((i: { name: string }) => i.name)).toContain('Advil 200 mg');
  });

  it('the pause switch hides the pharmacy and the summary counts today', async () => {
    const t = await login('pharmacie.tournon');
    expect((await api().patch('/api/pharmacy/settings').set(auth(t)).send({ paused: true })).body.user.pharmacy.paused).toBe(true);
    const near = await api().get('/api/pharmacies/nearby?lat=45.0655&lon=4.83&radiusKm=5');
    expect(near.body.items).toHaveLength(0);
    await api().patch('/api/pharmacy/settings').set(auth(t)).send({ paused: false });
    const s = await api().get('/api/pharmacy/summary').set(auth(t));
    expect(s.status).toBe(200);
    expect(s.body).toHaveProperty('received');
    expect(s.body.pending).toBeGreaterThanOrEqual(1); // seeded incoming request from Bruno
    expect(s.body.activeOrders).toBeGreaterThanOrEqual(1);
  });

  it('a pharmacy sees only its own orders', async () => {
    const t = await login('pharmacie.valence');
    const res = await api().get('/api/pharmacy/orders?scope=all').set(auth(t));
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const o of res.body.items) expect(o.patientName).toMatch(/^\S+ \S\.$/);
  });

  it("opens one of its own orders for the printable slip, never another pharmacy's", async () => {
    const t = await login('pharmacie.valence');
    const own = (await api().get('/api/pharmacy/orders?scope=all').set(auth(t))).body.items[0];
    const res = await api().get(`/api/pharmacy/orders/${own.id}`).set(auth(t));
    expect(res.status).toBe(200);
    expect(res.body.order.patientName).toMatch(/^\S+ \S\.$/);
    expect(res.body.order.pharmacy.name).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/latitude|longitude/);
    expect(res.body.order).not.toHaveProperty('destination');
    const other = await login('pharmacie.tournon');
    expect((await api().get(`/api/pharmacy/orders/${own.id}`).set(auth(other))).status).toBe(404);
  });
});

describe('patient data', () => {
  it('exports own data and deletes the account (anonymised, orders kept)', async () => {
    const reg = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'leaving@example.test', password: 'LongEnough123', firstName: 'Léa', lastName: 'Départ', address: '1 rue X' });
    const t = reg.body.token as string;
    const exp = await api().get('/api/patient/export').set(auth(t));
    expect(exp.status).toBe(200);
    expect(exp.body.profile.email).toBe('leaving@example.test');
    const bad = await api().delete('/api/patient/account').set(auth(t)).send({ password: 'wrong' });
    expect(bad.status).toBe(400);
    const del = await api().delete('/api/patient/account').set(auth(t)).send({ password: 'LongEnough123' });
    expect(del.body).toEqual({ deleted: true });
    expect((await api().post('/api/auth/login').send({ email: 'leaving@example.test', password: 'LongEnough123' })).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(t))).status).toBe(401);
  });

  it('refuses deletion while an order is in progress', async () => {
    const t = await login('alice');
    const res = await api().delete('/api/patient/account').set(auth(t)).send({ password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it('marks notifications as read', async () => {
    const t = await login('alice');
    await api().post('/api/notifications/read-all').set(auth(t));
    expect((await api().get('/api/notifications').set(auth(t))).body.unread).toBe(0);
  });
});
