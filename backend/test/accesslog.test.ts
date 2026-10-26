import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { runAccessLogCleanup } from '../src/services/accessLog.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const TOURNON = userId.pharmacy('tournon');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 5)]);

const logOf = async (who: string) => (await api().get('/api/patient/access-log').set(auth(await login(who)))).body.items as {
  id: number;
  kind: string;
  role: string;
  label: string;
  when: string;
}[];

describe('who looked at my data', () => {
  it('a pharmacy opening a request, an order, a prescription: each is written once per hour, with the pharmacy’s name', async () => {
    await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient('bruno')]);
    const pt = await login('bruno');
    const before = (await logOf('bruno')).length;
    const req = await api().post('/api/patient/requests').set(auth(pt)).send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    await api().post(`/api/patient/requests/${req.body.id}/files`).set(auth(pt)).set('Content-Type', 'image/png').send(PNG);
    // Nobody has looked yet: choosing a pharmacy is what lets it see the request.
    expect((await logOf('bruno')).length).toBe(before);
    await api().post(`/api/patient/requests/${req.body.id}/choose`).set(auth(pt)).send({ pharmacyId: TOURNON });

    const ph = await login('pharmacie.tournon');
    // Another pharmacy never sees it, so it never appears in the log.
    await api().get('/api/pharmacy/incoming').set(auth(await login('pharmacie.valence')));
    expect((await logOf('bruno')).filter((e) => e.label === 'Pharmacie de la Forum' || /Valence/.test(e.label)).length).toBe(0);

    // The chosen pharmacy's list refreshes several times: the rows written by the first look are all there is.
    await api().get('/api/pharmacy/incoming').set(auth(ph));
    const afterFirst = (await logOf('bruno')).filter((e) => e.kind === 'request');
    expect(afterFirst.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 3; i++) await api().get('/api/pharmacy/incoming').set(auth(ph));
    let log = await logOf('bruno');
    const requestRows = log.filter((e) => e.kind === 'request');
    expect(requestRows).toHaveLength(afterFirst.length);
    expect(requestRows[0]).toMatchObject({ role: 'pharmacy', label: 'Pharmacie du Rhône' });

    // It opens the prescription file.
    const fileId = (await api().get(`/api/pharmacy/requests/${req.body.id}/files`).set(auth(ph))).body.items[0].id as string;
    expect((await api().get(`/api/files/${fileId}`).set(auth(ph))).status).toBe(200);
    // And the order, once accepted: the list, the slip and the pickup page are all "the order".
    const orderId = (await api().post(`/api/pharmacy/requests/${req.body.id}/accept`).set(auth(ph)).send()).body.orderId as string;
    await api().get('/api/pharmacy/orders').set(auth(ph));
    await api().get(`/api/pharmacy/orders/${orderId}`).set(auth(ph));
    log = await logOf('bruno');
    expect(log.filter((e) => e.kind === 'prescription')).toHaveLength(1);
    expect(log.filter((e) => e.kind === 'order')).toHaveLength(1);

    // A team member acts as the pharmacy: shown with the pharmacy's name, not a person's.
    await api()
      .post('/api/pharmacy/team')
      .set(auth(ph))
      .send({ email: 'log@team.test', displayName: 'Léa Équipe', password: 'Password123!', role: 'pharmacist' });
    const member = (await api().post('/api/auth/login').send({ email: 'log@team.test', password: 'Password123!' })).body.token as string;
    await pool.query("UPDATE access_log SET bucket = bucket - interval '2 hours', created_at = created_at - interval '2 hours' WHERE patient_id = $1", [userId.patient('bruno')]);
    await api().get('/api/pharmacy/orders').set(auth(member));
    log = await logOf('bruno');
    expect(log.filter((e) => e.kind === 'order').length).toBe(2); // the old hour and the new one
    expect(JSON.stringify(log)).not.toMatch(/Léa|Doliprane|log@team/);
  });

  it('a doctor with a confirmed link and the staff area are written too; staff only as "staff", never by name', async () => {
    const doc = await login('dr.martin');
    await api().get('/api/doctor/patients').set(auth(doc));
    const alice = await logOf('alice');
    expect(alice.find((e) => e.kind === 'doctor')).toMatchObject({ role: 'doctor', label: 'Dr Martin' });

    const admin = await login('admin');
    await api().get('/api/admin/users?role=patient').set(auth(admin));
    await api().get('/api/admin/orders').set(auth(admin));
    const staff = (await logOf('alice')).filter((e) => e.kind === 'staff');
    expect(staff.length).toBeGreaterThanOrEqual(1);
    expect(staff.every((e) => e.role === 'staff' && e.label === '')).toBe(true);
    expect(JSON.stringify(await logOf('alice'))).not.toMatch(/admin@|Sam|Support/);
  });

  it('each patient reads only their own log; it is in the export; deleting the account deletes it; it is kept 12 months', async () => {
    const alice = await logOf('alice');
    const bruno = await logOf('bruno');
    expect(alice.length).toBeGreaterThan(0);
    expect(new Set([...alice, ...bruno].map((e) => e.id)).size).toBe(alice.length + bruno.length); // no row is shared
    expect((await api().get('/api/patient/access-log').set(auth(await login('pharmacie.tournon')))).status).toBe(403);
    expect((await api().get('/api/patient/access-log')).status).toBe(401);
    const exp = await api().get('/api/patient/export').set(auth(await login('alice')));
    expect(exp.body.accessLog.length).toBe(alice.length);

    await pool.query("UPDATE access_log SET created_at = now() - interval '13 months' WHERE id = $1", [bruno[0].id]);
    expect((await logOf('bruno')).find((e) => e.id === bruno[0].id)).toBeUndefined(); // already out of the 12-month view
    expect((await runAccessLogCleanup()).deleted).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT 1 FROM access_log WHERE id = $1', [bruno[0].id])).rowCount).toBe(0);

    const reg = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'seen@test.test', password: 'LongEnough123', firstName: 'Sam', lastName: 'Vu', address: '1 rue X' });
    await pool.query(
      `INSERT INTO access_log (patient_id, viewer_user_id, viewer_role, viewer_label, kind, bucket) VALUES ($1,$2,'doctor','Dr X','doctor', date_trunc('hour', now()))`,
      [reg.body.user.id, userId.doctor('dr.martin')],
    );
    expect((await api().delete('/api/patient/account').set(auth(reg.body.token)).send({ password: 'LongEnough123' })).status).toBe(200);
    expect((await pool.query('SELECT 1 FROM access_log WHERE patient_id = $1', [reg.body.user.id])).rowCount).toBe(0);
  });
});
