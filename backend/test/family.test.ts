import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const TOURNON = userId.pharmacy('tournon');

const send = async (t: string, body: Record<string, unknown>) =>
  api()
    .post('/api/patient/requests')
    .set(auth(t))
    .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }], ...body });
const ageRequests = (patient: string) =>
  pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(patient)]);

describe('family profiles', () => {
  it('an account keeps a few people (first name and relation only) and can make requests for them', async () => {
    const t = await login('alice');
    expect((await api().post('/api/patient/family').set(auth(t)).send({ firstName: 'Léa', relation: 'cousin' })).status).toBe(400);
    expect((await api().post('/api/patient/family').set(auth(t)).send({ firstName: ' ', relation: 'child' })).status).toBe(400);
    const lea = await api().post('/api/patient/family').set(auth(t)).send({ firstName: 'Léa', relation: 'child' });
    expect(lea.status).toBe(201);
    const list = await api().get('/api/patient/family').set(auth(t));
    expect(list.body.items).toEqual([{ id: lea.body.id, firstName: 'Léa', relation: 'child' }]);
    // Nothing else is stored about the person.
    const row = await pool.query('SELECT * FROM family_members WHERE id = $1', [lea.body.id]);
    expect(Object.keys(row.rows[0]).sort()).toEqual(['account_id', 'created_at', 'deleted_at', 'first_name', 'id', 'relation']);

    // At most 6 people.
    for (let i = 0; i < 5; i++) expect((await api().post('/api/patient/family').set(auth(t)).send({ firstName: `P${i}`, relation: 'other' })).status).toBe(201);
    const full = await api().post('/api/patient/family').set(auth(t)).send({ firstName: 'Trop', relation: 'other' });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('too_many_members');
  });

  it('the patient and the pharmacy see who the request is for; the pharmacy learns nothing more', async () => {
    const t = await login('bruno');
    const m = (await api().post('/api/patient/family').set(auth(t)).send({ firstName: 'Papa', relation: 'parent' })).body.id as string;
    await ageRequests('bruno');
    const created = await send(t, { forMemberId: m });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await api().post(`/api/patient/requests/${id}/choose`).set(auth(t)).send({ pharmacyId: TOURNON })).status).toBe(200);

    const mine = await api().get('/api/patient/requests').set(auth(t));
    expect(mine.body.items.find((r: { id: string }) => r.id === id).forMember).toEqual({ firstName: 'Papa', relation: 'parent' });
    expect((await api().get(`/api/patient/requests/${id}`).set(auth(t))).body.request.forMember.firstName).toBe('Papa');

    const ph = await login('pharmacie.tournon');
    const incoming = await api().get('/api/pharmacy/incoming').set(auth(ph));
    const card = incoming.body.items.find((r: { id: string }) => r.id === id);
    expect(card.forMember).toEqual({ firstName: 'Papa', relation: 'parent' });
    expect(card.patientName).toMatch(/^Bruno [A-Z]\.$/);
    // Only the account holder's "First L." and the person's first name: no last name, no birth date, no address, no email.
    expect(JSON.stringify(card)).not.toMatch(/@|birth|address|latitude/i);

    const orderId = (await api().post(`/api/pharmacy/requests/${id}/accept`).set(auth(ph)).send()).body.orderId as string;
    const orders = await api().get('/api/pharmacy/orders').set(auth(ph));
    expect(orders.body.items.find((o: { id: string }) => o.id === orderId).forMember.firstName).toBe('Papa');
    for (const status of ['preparing', 'ready']) await api().patch(`/api/pharmacy/orders/${orderId}/status`).set(auth(ph)).send({ status, prescriptionChecked: true });
    const code = (await pool.query('SELECT pickup_code FROM orders WHERE id = $1', [orderId])).rows[0].pickup_code as string;
    const preview = await api().post('/api/pharmacy/pickup/check').set(auth(ph)).send({ orderId, code });
    expect(preview.body.forMember).toEqual({ firstName: 'Papa', relation: 'parent' });
    expect((await api().get(`/api/patient/orders/${orderId}`).set(auth(t))).body.order.forMember.firstName).toBe('Papa');

    // A doctor or another patient never sees the family list.
    expect((await api().get('/api/patient/family').set(auth(await login('camille')))).body.items).toEqual([]);
    expect((await api().get('/api/patient/family').set(auth(await login('dr.martin')))).status).toBe(403);
  });

  it('nobody can use or remove someone else’s family member; a removed person disappears from the list but not from past requests', async () => {
    const alice = await login('alice');
    const bruno = await login('bruno');
    const mine = (await api().get('/api/patient/family').set(auth(alice))).body.items[0].id as string;
    await ageRequests('bruno');
    expect((await send(bruno, { forMemberId: mine })).status).toBe(404);
    expect((await api().delete(`/api/patient/family/${mine}`).set(auth(bruno))).status).toBe(404);

    await ageRequests('alice');
    const made = await send(alice, { forMemberId: mine });
    expect(made.status).toBe(201);
    expect((await api().delete(`/api/patient/family/${mine}`).set(auth(alice))).status).toBe(204);
    expect((await api().get('/api/patient/family').set(auth(alice))).body.items.find((p: { id: string }) => p.id === mine)).toBeUndefined();
    await ageRequests('alice');
    expect((await send(alice, { forMemberId: mine })).status).toBe(404);
    const past = await api().get('/api/patient/requests').set(auth(alice));
    expect(past.body.items.find((r: { id: string }) => r.id === made.body.id).forMember.firstName).toBe('Léa');
  });

  it('is in the data export, and deleting the account removes the people', async () => {
    const reg = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'family@test.test', password: 'LongEnough123', firstName: 'Fanny', lastName: 'Famille', address: '1 rue X' });
    const t = reg.body.token as string;
    await api().post('/api/patient/family').set(auth(t)).send({ firstName: 'Zoé', relation: 'child' });
    const exp = await api().get('/api/patient/export').set(auth(t));
    expect(exp.body.familyMembers.map((p: { firstName: string }) => p.firstName)).toEqual(['Zoé']);
    expect((await api().delete('/api/patient/account').set(auth(t)).send({ password: 'LongEnough123' })).status).toBe(200);
    expect((await pool.query('SELECT 1 FROM family_members WHERE account_id = $1', [reg.body.user.id])).rowCount).toBe(0);
  });
});
