import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { sentMails } from '../src/notify.js';
import { runRefillJob } from '../src/services/refills.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const ZYRTEC = medicineId(5);
const age = (p: string) => pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(p)]);

describe('refill reminders', () => {
  it('only for a medicine the person asked for; one per medicine; a due reminder is sent once, without naming the medicine', async () => {
    const t = await login('alice');
    // Never requested by this patient: refused.
    const never = await api().post('/api/patient/reminders').set(auth(t)).send({ medicineId: medicineId(20), days: 30 });
    expect(never.status).toBe(404);
    await age('alice');
    const made = await api().post('/api/patient/requests').set(auth(t)).send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    expect(made.status).toBe(201);
    expect((await api().post('/api/patient/reminders').set(auth(t)).send({ medicineId: DOLIPRANE, days: 5 })).status).toBe(400);
    expect((await api().post('/api/patient/reminders').set(auth(t)).send({ medicineId: DOLIPRANE, days: 30 })).status).toBe(201);
    // Asking again replaces the first reminder.
    expect((await api().post('/api/patient/reminders').set(auth(t)).send({ medicineId: DOLIPRANE, days: 14 })).status).toBe(201);
    const list = await api().get('/api/patient/reminders').set(auth(t));
    expect(list.body.items).toHaveLength(1);
    const days = (new Date(list.body.items[0].remindAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15);

    // Not due yet: nothing is sent. Due: sent once.
    expect((await runRefillJob()).sent).toBe(0);
    await pool.query("UPDATE refill_reminders SET remind_at = now() - interval '1 minute'");
    sentMails.length = 0;
    expect((await runRefillJob()).sent).toBe(1);
    expect((await runRefillJob()).sent).toBe(0);
    const note = (await api().get('/api/notifications').set(auth(t))).body.items.find((n: { kind: string }) => n.kind === 'refill');
    expect(note.link).toBe(`/medicines/${DOLIPRANE}`);
    expect(JSON.stringify(note)).not.toMatch(/Doliprane/i);
    expect(JSON.stringify(note)).not.toMatch(/\d+\s*(mg|ml|comprim|times|fois)/i); // a date, never a dose
    expect(sentMails.every((m) => !/doliprane/i.test(m.subject + m.body))).toBe(true);
    expect((await api().get('/api/patient/reminders').set(auth(t))).body.items).toEqual([]);
  });

  it('can be removed, and nobody can remove another person’s reminder', async () => {
    const t = await login('bruno');
    await age('bruno');
    await api().post('/api/patient/requests').set(auth(t)).send({ items: [{ medicineId: ZYRTEC, quantity: 1 }] });
    const r = await api().post('/api/patient/reminders').set(auth(t)).send({ medicineId: ZYRTEC, days: 7 });
    expect((await api().delete(`/api/patient/reminders/${r.body.id}`).set(auth(await login('camille')))).status).toBe(404);
    expect((await api().delete(`/api/patient/reminders/${r.body.id}`).set(auth(t))).status).toBe(204);
  });
});

describe('request again', () => {
  it('makes a new request with the same medicines, quantities and person; only for the patient’s own requests', async () => {
    const t = await login('david');
    const lea = (await api().post('/api/patient/family').set(auth(t)).send({ firstName: 'Léa', relation: 'child' })).body.id as string;
    await age('david');
    const first = await api()
      .post('/api/patient/requests')
      .set(auth(t))
      .send({ items: [{ medicineId: DOLIPRANE, quantity: 2 }, { medicineId: ZYRTEC, quantity: 1 }], forMemberId: lea });
    expect(first.status).toBe(201);
    // Inside the two-minute window an identical request is the same one (no duplicates by accident).
    expect((await api().post(`/api/patient/requests/${first.body.id}/repeat`).set(auth(t))).body.duplicate).toBe(true);
    await age('david');
    const again = await api().post(`/api/patient/requests/${first.body.id}/repeat`).set(auth(t));
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(first.body.id);
    const detail = await api().get(`/api/patient/requests/${again.body.id}`).set(auth(t));
    expect(detail.body.request.items.map((i: { quantity: number }) => i.quantity).sort()).toEqual([1, 2]);
    expect(detail.body.request.forMember.firstName).toBe('Léa');
    expect((await api().post(`/api/patient/requests/${first.body.id}/repeat`).set(auth(await login('alice')))).status).toBe(404);
  });
});
