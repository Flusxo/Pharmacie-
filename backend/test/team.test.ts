import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';

beforeAll(freshDb);

const OWNER = 'pharmacie.tournon';
const mail = (n: string) => `${n}@team.test`;

async function addMember(owner: string, name: string, role: 'pharmacist' | 'assistant') {
  const res = await api()
    .post('/api/pharmacy/team')
    .set(auth(owner))
    .send({ email: mail(name), displayName: name, password: PASSWORD, role });
  expect(res.status).toBe(201);
  const l = await api().post('/api/auth/login').send({ email: mail(name), password: PASSWORD });
  expect(l.status).toBe(200);
  return { id: res.body.id as string, token: l.body.token as string };
}

describe('pharmacy team accounts', () => {
  it('the owner adds a pharmacist and an assistant, who see the pharmacy and its name', async () => {
    const owner = await login(OWNER);
    const ph = await addMember(owner, 'paul', 'pharmacist');
    const as = await addMember(owner, 'alice', 'assistant');
    const me = await api().get('/api/auth/me').set(auth(ph.token));
    expect(me.body.user.pharmacy.name).toBe('Pharmacie du Rhône');
    expect(me.body.user.memberRole).toBe('pharmacist');
    const team = await api().get('/api/pharmacy/team').set(auth(owner));
    expect(team.body.items.map((m: { role: string }) => m.role).sort()).toEqual(['assistant', 'pharmacist']);
    // The pharmacist works on the same stock as the owner.
    const inv = await api().get('/api/pharmacy/inventory').set(auth(ph.token));
    const own = await api().get('/api/pharmacy/inventory').set(auth(owner));
    expect(inv.status).toBe(200);
    expect(inv.body.items.length).toBe(own.body.items.length);
    expect(as.id).toBeTruthy();
  });

  it('roles are enforced: only the owner manages the team; an assistant cannot change stock or settings', async () => {
    const owner = await login(OWNER);
    const ph = (await api().post('/api/auth/login').send({ email: mail('paul'), password: PASSWORD })).body.token as string;
    const as = (await api().post('/api/auth/login').send({ email: mail('alice'), password: PASSWORD })).body.token as string;
    expect((await api().get('/api/pharmacy/team').set(auth(ph))).status).toBe(403);
    expect((await api().patch('/api/pharmacy/settings').set(auth(ph)).send({ paused: true })).status).toBe(403);
    expect((await api().get('/api/pharmacy/inventory').set(auth(as))).status).toBe(200);
    expect((await api().get('/api/pharmacy/activity').set(auth(as))).status).toBe(403);
    const inv = await api().get('/api/pharmacy/inventory').set(auth(owner));
    const med = inv.body.items[0].medicineId as string;
    const put = (t: string) => api().put(`/api/pharmacy/inventory/${med}`).set(auth(t)).send({ quantity: 7, priceEur: 3.5, lowStockThreshold: 2 });
    expect((await put(as)).status).toBe(403);
    expect((await put(ph)).status).toBe(200);
  });

  it('every change is in the activity log with who did it; removing a member ends their session', async () => {
    const owner = await login(OWNER);
    const log = await api().get('/api/pharmacy/activity').set(auth(owner));
    expect(log.status).toBe(200);
    const mine = log.body.items.filter((a: { actorName: string }) => a.actorName === 'paul');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].actorRole).toBe('pharmacist');
    expect(mine[0].action).toBe('PUT /inventory/:medicineId');
    const team = await api().get('/api/pharmacy/team').set(auth(owner));
    const alice = team.body.items.find((m: { displayName: string }) => m.displayName === 'alice');
    const as = (await api().post('/api/auth/login').send({ email: mail('alice'), password: PASSWORD })).body.token as string;
    expect((await api().delete(`/api/pharmacy/team/${alice.id}`).set(auth(owner))).status).toBe(204);
    expect((await api().get('/api/pharmacy/inventory').set(auth(as))).status).toBe(401);
  });

  it('a member of one pharmacy cannot be removed by another pharmacy', async () => {
    const other = await login('pharmacie.valence');
    const owner = await login(OWNER);
    const team = await api().get('/api/pharmacy/team').set(auth(owner));
    const paul = team.body.items.find((m: { displayName: string }) => m.displayName === 'paul');
    expect((await api().delete(`/api/pharmacy/team/${paul.id}`).set(auth(other))).status).toBe(404);
  });
});
