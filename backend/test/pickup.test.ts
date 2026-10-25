import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const TOURNON = userId.pharmacy('tournon');

async function readyOrder(patient = 'alice') {
  await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(patient)]);
  const pt = await login(patient);
  const created = await api()
    .post('/api/patient/requests')
    .set(auth(pt))
    .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
  expect(created.status).toBe(201);
  const requestId = created.body.id as string;
  expect((await api().post(`/api/patient/requests/${requestId}/choose`).set(auth(pt)).send({ pharmacyId: TOURNON })).status).toBe(200);
  const ph = await login('pharmacie.tournon');
  const acc = await api().post(`/api/pharmacy/requests/${requestId}/accept`).set(auth(ph)).send();
  const orderId = acc.body.orderId as string;
  for (const status of ['preparing', 'ready']) {
    const r = await api().patch(`/api/pharmacy/orders/${orderId}/status`).set(auth(ph)).send({ status, prescriptionChecked: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  return { orderId, pt, ph };
}

describe('pickup code', () => {
  it('the patient gets a short code, only while the order can be picked up; the pharmacy confirms with it and the order is delivered', async () => {
    const { orderId, pt, ph } = await readyOrder();
    const view = await api().get(`/api/patient/orders/${orderId}`).set(auth(pt));
    const code = view.body.order?.pickupCode ?? view.body.pickupCode;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    // Wrong code: refused, with no detail about why.
    const wrong = await api().post('/api/pharmacy/pickup/check').set(auth(ph)).send({ orderId, code: 'AAAAAA' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('invalid_pickup_code');

    // Another pharmacy cannot use a valid code.
    const other = await login('pharmacie.valence');
    expect((await api().post('/api/pharmacy/pickup/check').set(auth(other)).send({ orderId, code })).status).toBe(400);

    // The right code (even typed in lower case with a space) shows the order as "First L." and confirms in one step.
    const preview = await api().post('/api/pharmacy/pickup/check').set(auth(ph)).send({ orderId, code: code.toLowerCase().replace(/^(...)/, '$1 ') });
    expect(preview.status).toBe(200);
    expect(preview.body.patientName).toMatch(/^[A-Z][a-zé]+ [A-Z]\.$/);
    const done = await api().post(`/api/pharmacy/orders/${orderId}/pickup`).set(auth(ph)).send({ code });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('delivered');
    const row = await pool.query('SELECT status, pickup_confirmed_at FROM orders WHERE id = $1', [orderId]);
    expect(row.rows[0].status).toBe('delivered');
    expect(row.rows[0].pickup_confirmed_at).toBeTruthy();
    // Used up: the code is no longer shown, and cannot be used again.
    const after = await api().get(`/api/patient/orders/${orderId}`).set(auth(pt));
    expect(after.body.order?.pickupCode ?? after.body.pickupCode ?? null).toBeNull();
    expect((await api().post(`/api/pharmacy/orders/${orderId}/pickup`).set(auth(ph)).send({ code })).status).toBe(409);
  });

  it('an order that is not ready cannot be picked up, and another patient cannot see the code', async () => {
    const ph = await login('pharmacie.tournon');
    await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient('bruno')]);
    const pt = await login('bruno');
    const created = await api()
      .post('/api/patient/requests')
      .set(auth(pt))
      .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    const requestId = created.body.id as string;
    await api().post(`/api/patient/requests/${requestId}/choose`).set(auth(pt)).send({ pharmacyId: TOURNON });
    const acc = await api().post(`/api/pharmacy/requests/${requestId}/accept`).set(auth(ph)).send();
    const orderId = acc.body.orderId as string;
    const code = (await pool.query('SELECT pickup_code FROM orders WHERE id = $1', [orderId])).rows[0].pickup_code as string;
    expect(code).toBeTruthy();
    const early = await api().post(`/api/pharmacy/orders/${orderId}/pickup`).set(auth(ph)).send({ code });
    expect(early.status).toBe(409);
    const alice = await login('alice');
    expect((await api().get(`/api/patient/orders/${orderId}`).set(auth(alice))).status).toBe(404);
  });
});
