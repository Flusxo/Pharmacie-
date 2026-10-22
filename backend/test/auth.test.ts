import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';
import { authenticate, requireRole, requireStaff } from '../src/middleware/auth.js';
import { errorHandler } from '../src/errors.js';
import { sentMails } from '../src/notify.js';

beforeAll(freshDb);

const GENERIC = 'Invalid email or password.';

describe('registration', () => {
  it('registers a patient as active and never returns the password hash', async () => {
    const res = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'New.Patient@Example.test', password: 'LongEnough123', firstName: 'Nina', lastName: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new.patient@example.test', role: 'patient', status: 'active' });
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  it('registers a doctor and a pharmacy as pending', async () => {
    const d = await api()
      .post('/api/auth/register/doctor')
      .send({ email: 'dr.new@example.test', password: 'LongEnough123', firstName: 'Jean', lastName: 'Neuf', rpps: '12345678901' });
    expect(d.status).toBe(201);
    expect(d.body.user).toMatchObject({ role: 'doctor', status: 'pending', verified: false });

    const p = await api().post('/api/auth/register/pharmacy').send({
      email: 'pharma.new@example.test',
      password: 'LongEnough123',
      name: 'Pharmacie Nouvelle',
      finess: '123456789',
      address: '1 rue du Test, 26000 Valence',
      city: 'Valence',
      latitude: 44.93,
      longitude: 4.89,
    });
    expect(p.status).toBe(201);
    expect(p.body.user).toMatchObject({ role: 'pharmacy', status: 'pending', verified: false });
  });

  it('rejects a short password with a clear 400 message', async () => {
    const res = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'short@example.test', password: 'short', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password: must be at least 10 characters/);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'alice@pharmacie.test', password: 'LongEnough123', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(409);
  });
});

describe('login', () => {
  it.each(['alice', 'dr.martin', 'pharmacie.tournon', 'admin', 'support', 'moderator'])(
    'logs in %s through the single endpoint',
    async (who) => {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: `${who}@pharmacie.test`, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      const me = await api().get('/api/auth/me').set(auth(res.body.token));
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe(`${who}@pharmacie.test`);
    },
  );

  it('gives the same generic message for a wrong password and an unknown email', async () => {
    const wrong = await api().post('/api/auth/login').send({ email: 'bruno@pharmacie.test', password: 'WrongPassword1' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@pharmacie.test', password: 'WrongPassword1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(GENERIC);
    expect(unknown.body.error).toBe(GENERIC);
  });

  it('locks the account for 15 minutes after 5 failures, still with the generic message', async () => {
    await api()
      .post('/api/auth/register/patient')
      .send({ email: 'lock.me@example.test', password: 'CorrectHorse1', firstName: 'Lock', lastName: 'Me' });
    for (let i = 0; i < 5; i++) {
      const r = await api().post('/api/auth/login').send({ email: 'lock.me@example.test', password: 'WrongPassword1' });
      expect(r.body.error).toBe(GENERIC);
    }
    const blocked = await api().post('/api/auth/login').send({ email: 'lock.me@example.test', password: 'CorrectHorse1' });
    expect(blocked.status).toBe(401);
    expect(blocked.body.error).toBe(GENERIC);
  });

  it('lets a pending doctor log in (so they can see "waiting for approval")', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'dr.bernard@pharmacie.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ status: 'pending', verified: false });
  });

  it('rejects a tampered token with a clear 401', async () => {
    const res = await api().get('/api/auth/me').set(auth('not.a.jwt'));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/session has expired/);
  });

  it('requires a token for /me', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
  });
});

describe('role protection middleware', () => {
  // A tiny app that mounts the real middleware in front of dummy handlers.
  const app = express();
  app.use(authenticate);
  app.get('/doctor', requireRole('doctor'), (_q, r) => void r.json({ ok: true }));
  app.get('/pharmacy', requireRole('pharmacy'), (_q, r) => void r.json({ ok: true }));
  app.get('/patient', requireRole('patient'), (_q, r) => void r.json({ ok: true }));
  app.get('/admin-only', requireStaff('admin'), (_q, r) => void r.json({ ok: true }));
  app.get('/staff', requireStaff(), (_q, r) => void r.json({ ok: true }));
  app.use(errorHandler);
  const call = (path: string, token?: string) => (token ? request(app).get(path).set(auth(token)) : request(app).get(path));

  it('blocks pending doctors and pharmacies with "Waiting for staff approval"', async () => {
    const drBernard = await login('dr.bernard');
    const res = await call('/doctor', drBernard);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('pending_verification');
    expect(res.body.error).toMatch(/Waiting for staff approval/);
    const demo = await login('pharmacie.demo');
    expect((await call('/pharmacy', demo)).status).toBe(403);
  });

  it('allows verified roles and refuses other roles', async () => {
    expect((await call('/doctor', await login('dr.martin'))).status).toBe(200);
    expect((await call('/pharmacy', await login('pharmacie.tournon'))).status).toBe(200);
    expect((await call('/patient', await login('alice'))).status).toBe(200);
    expect((await call('/doctor', await login('alice'))).status).toBe(403);
    expect((await call('/patient', await login('dr.martin'))).status).toBe(403);
    expect((await call('/staff', await login('alice'))).status).toBe(403);
    expect((await call('/doctor')).status).toBe(401);
  });

  it('enforces staff sub-roles', async () => {
    expect((await call('/admin-only', await login('admin'))).status).toBe(200);
    const sup = await call('/admin-only', await login('support'));
    expect(sup.status).toBe(403);
    expect(sup.body.error).toMatch(/support/);
    expect((await call('/staff', await login('moderator'))).status).toBe(200);
  });
});

describe('password reset', () => {
  it('answers the same for known and unknown emails and sends a single-use link', async () => {
    const a = await api().post('/api/auth/forgot-password').send({ email: 'emma@pharmacie.test' });
    const b = await api().post('/api/auth/forgot-password').send({ email: 'ghost@pharmacie.test' });
    expect(a.status).toBe(200);
    expect(a.body.message).toBe(b.body.message);

    const mail = sentMails.filter((m) => m.to === 'emma@pharmacie.test').at(-1);
    // Emma's account language is French (the default), so the email is in French.
    expect(mail?.subject).toBe('Réinitialisez votre mot de passe');
    expect(sentMails.some((m) => m.to === 'ghost@pharmacie.test')).toBe(false);
    const token = mail!.body.match(/token=([a-f0-9]{64})/)![1];

    const reset = await api().post('/api/auth/reset-password').send({ token, password: 'BrandNewPass1' });
    expect(reset.status).toBe(200);
    const again = await api().post('/api/auth/reset-password').send({ token, password: 'AnotherPass12' });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/invalid, expired or already used/);

    const ok = await api().post('/api/auth/login').send({ email: 'emma@pharmacie.test', password: 'BrandNewPass1' });
    expect(ok.status).toBe(200);
  });

  it('changes the password only with the current one', async () => {
    const token = await login('david');
    const bad = await api()
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'nope', newPassword: 'NewPassword12' });
    expect(bad.status).toBe(400);
    const good = await api()
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword12' });
    expect(good.status).toBe(200);
  });
});
