import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';
import { pool } from '../src/db.js';
import { userId } from '../../db/src/index.js';

beforeAll(freshDb);

const as = async (who: string) => auth(await login(who));
const lastAudit = async () =>
  (await pool.query('SELECT action, target, reason, actor_user_id FROM audit_log ORDER BY id DESC LIMIT 1')).rows[0];

describe('staff can view', () => {
  it.each(['admin', 'support', 'moderator'])('%s reads stats, users, verifications, reports, audit, performance', async (who) => {
    const h = await as(who);
    for (const path of [
      'stats',
      'users',
      'verifications',
      'pharmacies',
      'doctors',
      'medicines',
      'orders',
      'reports',
      'audit',
      'performance',
    ]) {
      const res = await api().get(`/api/admin/${path}`).set(h);
      expect(res.status, path).toBe(200);
    }
  });

  it('users can be filtered and never expose password hashes', async () => {
    const res = await api()
      .get('/api/admin/users?role=pharmacy&status=pending')
      .set(await as('support'));
    expect(res.body.items.map((u: { email: string }) => u.email)).toEqual(['pharmacie.demo@pharmacie.test']);
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/);
  });

  it('non-staff are refused and there is no impersonation route', async () => {
    expect(
      (
        await api()
          .get('/api/admin/stats')
          .set(await as('alice'))
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .get('/api/admin/stats')
          .set(await as('pharmacie.tournon'))
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .post(`/api/admin/users/${userId.patient('alice')}/impersonate`)
          .set(await as('admin'))
      ).status,
    ).toBe(404);
  });

  it('the verification queue lists pending doctors and pharmacies', async () => {
    const res = await api()
      .get('/api/admin/verifications')
      .set(await as('moderator'));
    const names = res.body.items.map((v: { name: string }) => v.name);
    expect(names).toEqual(expect.arrayContaining(['Dr Paul Bernard', 'Dr Sophie Petit', 'Pharmacie Démo']));
  });
});

describe('verification', () => {
  it('support cannot verify', async () => {
    const res = await api()
      .post(`/api/admin/verify/pharmacy/${userId.pharmacy('demo')}`)
      .set(await as('support'))
      .send({ decision: 'approve' });
    expect(res.status).toBe(403);
  });

  it('a new pharmacy is blocked until a moderator verifies it, then works and is proposed', async () => {
    const before = await api()
      .get('/api/pharmacy/incoming')
      .set(await as('pharmacie.demo'));
    expect(before.status).toBe(403);
    const ok = await api()
      .post(`/api/admin/verify/pharmacy/${userId.pharmacy('demo')}`)
      .set(await as('moderator'))
      .send({ decision: 'approve' });
    expect(ok.status).toBe(200);
    const a = await lastAudit();
    expect(a).toMatchObject({ action: 'approve_pharmacy', actor_user_id: userId.staff('moderator') });
    const after = await api()
      .get('/api/pharmacy/incoming')
      .set(await as('pharmacie.demo'));
    expect(after.status).toBe(200);
    const near = await api().get('/api/pharmacies/nearby?lat=45.07&lon=4.844&radiusKm=2');
    expect(near.body.items.map((p: { name: string }) => p.name)).toContain('Pharmacie Démo');
  });

  it('a newly registered doctor is blocked, then verified by an admin and can work', async () => {
    const reg = await api()
      .post('/api/auth/register/doctor')
      .send({ email: 'dr.nouveau@example.test', password: 'LongEnough123', firstName: 'Luc', lastName: 'Nouveau', rpps: '19999999999' });
    const t = reg.body.token as string;
    expect((await api().get('/api/doctor/patients').set(auth(t))).status).toBe(403);
    const ok = await api()
      .post(`/api/admin/verify/doctor/${reg.body.user.id}`)
      .set(await as('admin'))
      .send({ decision: 'approve' });
    expect(ok.status).toBe(200);
    expect((await api().get('/api/doctor/patients').set(auth(t))).status).toBe(200);
    const me = await api().get('/api/auth/me').set(auth(t));
    expect(me.body.user).toMatchObject({ status: 'active', verified: true });
  });

  it('rejecting needs a reason, which the professional can see', async () => {
    const h = await as('moderator');
    const id = userId.doctor('dr.petit');
    const noReason = await api().post(`/api/admin/verify/doctor/${id}`).set(h).send({ decision: 'reject' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toMatch(/reason: a reason is required to reject/);
    const ok = await api().post(`/api/admin/verify/doctor/${id}`).set(h).send({ decision: 'reject', reason: 'RPPS number not found' });
    expect(ok.status).toBe(200);
    expect(await lastAudit()).toMatchObject({ action: 'reject_doctor', reason: 'RPPS number not found' });
    const me = await api()
      .get('/api/auth/me')
      .set(await as('dr.petit'));
    expect(me.body.user).toMatchObject({ verified: false, status: 'pending' });
    expect(me.body.user.doctor.rejectionReason).toBe('RPPS number not found');
  });
});

describe('suspend / reactivate', () => {
  it('support cannot suspend', async () => {
    const res = await api()
      .post(`/api/admin/users/${userId.patient('emma')}/suspend`)
      .set(await as('support'))
      .send({ reason: 'test' });
    expect(res.status).toBe(403);
  });

  it('a reason is required, the user is blocked, and it is audited', async () => {
    const h = await as('moderator');
    const emmaToken = await login('emma');
    const id = userId.patient('emma');
    expect((await api().post(`/api/admin/users/${id}/suspend`).set(h).send({})).status).toBe(400);
    const ok = await api().post(`/api/admin/users/${id}/suspend`).set(h).send({ reason: 'Abusive reports' });
    expect(ok.body).toEqual({ ok: true, status: 'suspended' });
    expect(await lastAudit()).toMatchObject({ action: 'suspend_user', reason: 'Abusive reports' });
    expect((await api().get('/api/auth/me').set(auth(emmaToken))).status).toBe(401);
    const login403 = await api().post('/api/auth/login').send({ email: 'emma@pharmacie.test', password: PASSWORD });
    expect(login403.status).toBe(403);
    expect(login403.body.error).toMatch(/suspended/);
    const back = await api().post(`/api/admin/users/${id}/reactivate`).set(h).send({ reason: 'Appeal accepted' });
    expect(back.body.status).toBe('active');
    expect((await api().post('/api/auth/login').send({ email: 'emma@pharmacie.test', password: PASSWORD })).status).toBe(200);
  });

  it('only an admin can suspend staff, and nobody can suspend themselves', async () => {
    const mod = await api()
      .post(`/api/admin/users/${userId.staff('support')}/suspend`)
      .set(await as('moderator'))
      .send({ reason: 'test' });
    expect(mod.status).toBe(403);
    const self = await api()
      .post(`/api/admin/users/${userId.staff('admin')}/suspend`)
      .set(await as('admin'))
      .send({ reason: 'test' });
    expect(self.status).toBe(403);
  });
});

describe('staff creation (admin only)', () => {
  const newStaff = { email: 'new.support@pharmacie.test', password: 'LongEnough123', fullName: 'Nora Support', staffRole: 'support' };

  it('moderator and support cannot create staff', async () => {
    expect(
      (
        await api()
          .post('/api/admin/staff')
          .set(await as('moderator'))
          .send(newStaff)
      ).status,
    ).toBe(403);
    expect(
      (
        await api()
          .post('/api/admin/staff')
          .set(await as('support'))
          .send(newStaff)
      ).status,
    ).toBe(403);
  });

  it('admin can, and the new staff member can log in', async () => {
    const res = await api()
      .post('/api/admin/staff')
      .set(await as('admin'))
      .send(newStaff);
    expect(res.status).toBe(201);
    expect(await lastAudit()).toMatchObject({ action: 'create_staff', reason: 'role support' });
    const l = await api().post('/api/auth/login').send({ email: newStaff.email, password: newStaff.password });
    expect(l.body.user.staff.staffRole).toBe('support');
  });
});

describe('medicines and reports', () => {
  it('moderator manages medicines; support cannot; every change is audited', async () => {
    const body = {
      cip13: '3400999999999',
      name: 'Testamol 500 mg',
      activeSubstance: 'paracétamol',
      form: 'tablet',
      dosage: '500 mg',
      category: 'pain',
      requiresPrescription: false,
      imageUrl: 'https://example.test/testamol.png',
    };
    expect(
      (
        await api()
          .post('/api/admin/medicines')
          .set(await as('support'))
          .send(body)
      ).status,
    ).toBe(403);
    const bad = await api()
      .post('/api/admin/medicines')
      .set(await as('moderator'))
      .send({ ...body, imageUrl: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
    const created = await api()
      .post('/api/admin/medicines')
      .set(await as('moderator'))
      .send(body);
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await api().get('/api/medicines?q=testamol')).body.items[0].name).toBe('Testamol 500 mg');

    const upd = await api()
      .patch(`/api/admin/medicines/${id}`)
      .set(await as('moderator'))
      .send({ dosage: '500 mg (boîte de 16)' });
    expect(upd.status).toBe(200);
    expect(await lastAudit()).toMatchObject({ action: 'update_medicine', reason: 'fields: dosage' });

    expect(
      (
        await api()
          .delete(`/api/admin/medicines/${id}`)
          .set(await as('moderator'))
          .send({})
      ).status,
    ).toBe(400);
    const del = await api()
      .delete(`/api/admin/medicines/${id}`)
      .set(await as('moderator'))
      .send({ reason: 'Duplicate entry' });
    expect(del.status).toBe(200);
    const after = (await api().get('/api/medicines?q=testamol')).body.items.map((m: { name: string }) => m.name);
    expect(after).not.toContain('Testamol 500 mg');
    expect((await api().get(`/api/medicines/${id}`)).status).toBe(404);
  });

  it('any user files a report; support resolves it with an audited resolution', async () => {
    const filed = await api()
      .post('/api/reports')
      .set(await as('bruno'))
      .send({ subject: 'Stock incorrect', message: 'La pharmacie affichait du stock mais n’en avait pas.' });
    expect(filed.status).toBe(201);
    const res = await api()
      .post(`/api/admin/reports/${filed.body.id}/resolve`)
      .set(await as('support'))
      .send({ resolution: 'Pharmacy asked to update its stock' });
    expect(res.status).toBe(200);
    expect(await lastAudit()).toMatchObject({ action: 'resolve_report', actor_user_id: userId.staff('support') });
    const again = await api()
      .post(`/api/admin/reports/${filed.body.id}/resolve`)
      .set(await as('support'))
      .send({ resolution: 'again' });
    expect(again.status).toBe(404);
  });

  it('every staff write in this file left an audit row with a reason where required', async () => {
    const rows = (await pool.query(`SELECT action, reason FROM audit_log WHERE created_at > now() - interval '10 minutes'`)).rows;
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'approve_pharmacy',
        'approve_doctor',
        'reject_doctor',
        'suspend_user',
        'reactivate_user',
        'create_staff',
        'create_medicine',
        'update_medicine',
        'delete_medicine',
        'resolve_report',
      ]),
    );
    for (const r of rows.filter((x) =>
      ['reject_doctor', 'suspend_user', 'reactivate_user', 'delete_medicine', 'resolve_report'].includes(x.action),
    )) {
      expect(r.reason).toBeTruthy();
    }
  });

  it('performance table has one row per verified pharmacy', async () => {
    const res = await api()
      .get('/api/admin/performance')
      .set(await as('admin'));
    const tournon = res.body.items.find((p: { name: string }) => p.name === 'Pharmacie du Rhône');
    expect(tournon.received).toBeGreaterThan(0);
    expect(tournon.acceptanceRate).toBeGreaterThan(0);
  });
});
