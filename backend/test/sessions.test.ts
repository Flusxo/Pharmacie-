import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, PASSWORD } from './helpers.js';

beforeAll(freshDb);

const loginAs = async (email: string, ua: string) => {
  const r = await api().post('/api/auth/login').set('User-Agent', ua).send({ email, password: PASSWORD });
  expect(r.status).toBe(200);
  return r.body.token as string;
};

describe('sessions', () => {
  it('each login is a session the person can see; signing one out ends only that token', async () => {
    const phone = await loginAs('alice@pharmacie.test', 'Mozilla/5.0 (iPhone) Safari');
    const laptop = await loginAs('alice@pharmacie.test', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130');
    const list = await api().get('/api/auth/sessions').set(auth(laptop));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    expect(list.body.items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const other = list.body.items.find((s: { current: boolean; userAgent: string }) => !s.current && /iPhone/.test(s.userAgent));
    expect(other).toBeTruthy();
    expect((await api().delete(`/api/auth/sessions/${other.id}`).set(auth(laptop))).status).toBe(204);
    expect((await api().get('/api/auth/me').set(auth(phone))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(laptop))).status).toBe(200);
  });

  it('logout ends the current token; logout-all ends every device; nobody can end another person’s session', async () => {
    const a1 = await loginAs('bruno@pharmacie.test', 'A');
    const a2 = await loginAs('bruno@pharmacie.test', 'B');
    const other = await loginAs('camille@pharmacie.test', 'C');
    const mine = await api().get('/api/auth/sessions').set(auth(a1));
    const camilles = await api().get('/api/auth/sessions').set(auth(other));
    await api().delete(`/api/auth/sessions/${camilles.body.items[0].id}`).set(auth(a1));
    expect((await api().get('/api/auth/me').set(auth(other))).status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThanOrEqual(2);
    expect((await api().post('/api/auth/logout').set(auth(a1))).status).toBe(204);
    expect((await api().get('/api/auth/me').set(auth(a1))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(a2))).status).toBe(200);
    expect((await api().post('/api/auth/logout-all').set(auth(a2))).status).toBe(204);
    expect((await api().get('/api/auth/me').set(auth(a2))).status).toBe(401);
  });
});
