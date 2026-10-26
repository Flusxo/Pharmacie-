import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { weeklySummary, runWeeklySummaryJob } from '../src/services/weekly.js';
import { clearFlagCache } from '../src/services/settings.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const TOURNON = userId.pharmacy('tournon');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);

const flip = async (name: string, on: boolean, who = 'admin') =>
  api()
    .put(`/api/admin/features/${name}`)
    .set(auth(await login(who)))
    .send({ on, reason: 'Test de la fonction' });

describe('feature switches', () => {
  it('are on by default, public, and changed by an admin only with a reason (audit logged)', async () => {
    const pub = await api().get('/api/features');
    expect(pub.body).toEqual({ messages: true, reviews: true, uploads: true, slots: true, signups: true });
    expect((await flip('messages', false, 'support')).status).toBe(403);
    expect((await flip('messages', false, 'moderator')).status).toBe(403);
    expect((await flip('nonsense', false)).status).toBe(400);
    const noReason = await api().put('/api/admin/features/messages').set(auth(await login('admin'))).send({ on: false });
    expect(noReason.status).toBe(400);
    expect((await flip('messages', false)).status).toBe(200);
    clearFlagCache();
    expect((await api().get('/api/features')).body.messages).toBe(false);
    // Any staff can read them.
    const seen = await api().get('/api/admin/features').set(auth(await login('support')));
    expect(seen.body.items.find((f: { name: string }) => f.name === 'messages')).toMatchObject({ on: false });
    expect((await pool.query("SELECT 1 FROM audit_log WHERE action = 'feature_off' AND target = 'messages'")).rowCount).toBe(1);
    expect((await flip('messages', true)).status).toBe(200);
  });

  it('a switched-off feature refuses new actions with a clear message and keeps reading what exists', async () => {
    // An order to talk about, review, schedule and attach a file to.
    await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient('alice')]);
    const pt = await login('alice');
    const req = await api().post('/api/patient/requests').set(auth(pt)).send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    await api().post(`/api/patient/requests/${req.body.id}/choose`).set(auth(pt)).send({ pharmacyId: TOURNON });
    const ph = await login('pharmacie.tournon');
    const orderId = (await api().post(`/api/pharmacy/requests/${req.body.id}/accept`).set(auth(ph)).send()).body.orderId as string;

    await api().post(`/api/patient/orders/${orderId}/messages`).set(auth(pt)).send({ body: 'Bonjour' });
    for (const f of ['messages', 'reviews', 'uploads', 'slots']) expect((await flip(f, false)).status).toBe(200);
    clearFlagCache();

    const msg = await api().post(`/api/patient/orders/${orderId}/messages`).set(auth(pt)).send({ body: 'Encore' });
    expect(msg.status).toBe(503);
    expect(msg.body.code).toBe('feature_off');
    expect((await api().post(`/api/pharmacy/orders/${orderId}/messages`).set(auth(ph)).send({ body: 'Oui' })).status).toBe(503);
    // Reading the existing thread still works.
    expect((await api().get(`/api/patient/orders/${orderId}/messages`).set(auth(pt))).body.items).toHaveLength(1);
    expect((await api().post(`/api/patient/orders/${orderId}/review`).set(auth(pt)).send({ rating: 5 })).status).toBe(503);
    expect((await api().put(`/api/patient/orders/${orderId}/slot`).set(auth(pt)).send({ start: new Date().toISOString(), mode: 'pickup' })).status).toBe(503);
    const up = await api().post(`/api/patient/requests/${req.body.id}/files`).set(auth(pt)).set('Content-Type', 'image/png').send(PNG);
    expect(up.status).toBe(503);
    const applicant = await login('dr.bernard');
    expect((await api().post('/api/me/verification-files').set(auth(applicant)).set('Content-Type', 'image/png').send(PNG)).status).toBe(503);

    for (const f of ['messages', 'reviews', 'uploads', 'slots']) await flip(f, true);
    clearFlagCache();
    expect((await api().post(`/api/patient/orders/${orderId}/messages`).set(auth(pt)).send({ body: 'De nouveau' })).status).toBe(201);
  });

  it('closing sign-ups refuses new accounts but not logins', async () => {
    await flip('signups', false);
    clearFlagCache();
    const body = { email: 'late@test.test', password: 'LongEnough123', firstName: 'Lou', lastName: 'Tard', address: '1 rue X' };
    const closed = await api().post('/api/auth/register/patient').send(body);
    expect(closed.status).toBe(503);
    expect(closed.body.code).toBe('feature_off');
    expect((await api().post('/api/auth/register/doctor').send({ ...body, rpps: '10101010199', speciality: 'x' })).status).toBe(503);
    expect((await login('alice')).length).toBeGreaterThan(10);
    await flip('signups', true);
    clearFlagCache();
    expect((await api().post('/api/auth/register/patient').send(body)).status).toBe(201);
  });
});

describe('weekly summary', () => {
  it('counts the last 7 days next to the 7 days before, for staff only, with no personal data', async () => {
    // An older request falls in the previous week.
    await pool.query(`UPDATE requests SET created_at = now() - interval '10 days' WHERE id = (SELECT id FROM requests WHERE patient_id = $1 ORDER BY created_at LIMIT 1)`, [userId.patient('camille')]);
    const before = await weeklySummary();
    const t = await login('bruno');
    await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient('bruno')]);
    const made = await api().post('/api/patient/requests').set(auth(t)).send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const after = await weeklySummary();
    expect(after.current.requests).toBe(before.current.requests + 1);
    expect(after.previous.requests).toBe(before.previous.requests);
    expect(before.previous.requests).toBeGreaterThanOrEqual(1);

    const staff = await api().get('/api/admin/weekly-summary').set(auth(await login('support')));
    expect(staff.status).toBe(200);
    expect(staff.body.current.requests).toBe(after.current.requests);
    expect(JSON.stringify(staff.body)).not.toMatch(/@|alice|bruno|Doliprane/i);
    expect((await api().get('/api/admin/weekly-summary').set(auth(t))).status).toBe(403);
  });

  it('is announced once, on Monday morning, to staff admins only', async () => {
    const monday8 = new Date('2026-10-26T07:30:00Z'); // 08:30 in Paris (UTC+1 after the clock change)
    const sunday = new Date('2026-10-25T09:00:00Z');
    const mondayEarly = new Date('2026-11-02T05:00:00Z'); // 06:00 Paris
    expect((await runWeeklySummaryJob(sunday)).sent).toBe(0);
    expect((await runWeeklySummaryJob(mondayEarly)).sent).toBe(0);
    const first = await runWeeklySummaryJob(monday8);
    expect(first.sent).toBe(1); // the one staff admin of the demo data
    expect((await runWeeklySummaryJob(monday8)).sent).toBe(0); // not twice the same Monday
    const notes = await api().get('/api/notifications').set(auth(await login('admin')));
    expect(notes.body.items.some((n: { kind: string }) => n.kind === 'weekly_summary')).toBe(true);
    expect((await api().get('/api/notifications').set(auth(await login('support')))).body.items.some((n: { kind: string }) => n.kind === 'weekly_summary')).toBe(false);
    // The next Monday it is sent again.
    expect((await runWeeklySummaryJob(new Date('2026-11-02T08:00:00Z'))).sent).toBe(1);
  });
});
