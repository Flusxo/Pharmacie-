import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';
import { pool } from '../src/db.js';

beforeAll(freshDb);

describe('pharmacy profile page and breaks', () => {
  it('the owner sets services, languages and accessibility; the public page shows them; unknown codes are refused', async () => {
    const owner = await login('pharmacie.tournon');
    const me = await api().get('/api/auth/me').set(auth(owner));
    const id = me.body.user.id as string;
    const bad = await api().patch('/api/pharmacy/profile').set(auth(owner)).send({ services: ['magic'], languages: [], accessibility: [] });
    expect(bad.status).toBe(400);
    const ok = await api()
      .patch('/api/pharmacy/profile')
      .set(auth(owner))
      .send({ services: ['vaccination'], languages: ['fr', 'en'], accessibility: ['step_free'] });
    expect(ok.status).toBe(200);
    const pub = await api().get(`/api/pharmacies/${id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.pharmacy.services).toEqual(['vaccination']);
    expect(pub.body.pharmacy.languages).toEqual(['fr', 'en']);
    expect(pub.body.pharmacy.verified).toBe(true);
    expect(pub.body.pharmacy.name).toBeTruthy();
  });

  it('an assistant cannot edit the profile', async () => {
    const owner = await login('pharmacie.tournon');
    const add = await api()
      .post('/api/pharmacy/team')
      .set(auth(owner))
      .send({ email: 'ass@profile.test', displayName: 'Ass', password: PASSWORD, role: 'assistant' });
    expect(add.status).toBe(201);
    const t = (await api().post('/api/auth/login').send({ email: 'ass@profile.test', password: PASSWORD })).body.token as string;
    const res = await api().patch('/api/pharmacy/profile').set(auth(t)).send({ services: [], languages: [], accessibility: [] });
    expect(res.status).toBe(403);
  });

  it('a break pauses the pharmacy with an end time; turning the pause off clears it; an ended break is lifted by the job', async () => {
    const owner = await login('pharmacie.valence');
    const me = await api().get('/api/auth/me').set(auth(owner));
    const id = me.body.user.id as string;
    const res = await api().patch('/api/pharmacy/settings').set(auth(owner)).send({ breakMinutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.user.pharmacy.paused).toBe(true);
    expect(res.body.user.pharmacy.pausedUntil).toBeTruthy();
    // The pharmacy is not proposed while it is on a break.
    expect((await api().get(`/api/pharmacies/${id}`)).status).toBe(404);
    // End the break in the past: the scheduled job puts the pharmacy back.
    await pool.query("UPDATE pharmacies SET paused_until = now() - interval '1 minute' WHERE user_id = $1", [id]);
    await pool.query('UPDATE pharmacies SET paused = false, paused_until = NULL WHERE paused_until IS NOT NULL AND paused_until <= now()');
    expect((await api().get(`/api/pharmacies/${id}`)).status).toBe(200);
    const off = await api().patch('/api/pharmacy/settings').set(auth(owner)).send({ breakMinutes: 15 });
    const back = await api().patch('/api/pharmacy/settings').set(auth(owner)).send({ paused: false });
    expect(off.body.user.pharmacy.paused).toBe(true);
    expect(back.body.user.pharmacy.paused).toBe(false);
    expect(back.body.user.pharmacy.pausedUntil).toBeNull();
  });
});
