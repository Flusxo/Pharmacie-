import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';

beforeAll(freshDb);

describe('reminder for an unconfirmed doctor link', () => {
  it('works once a day, only for unconfirmed links of this doctor', async () => {
    const doc = await login('dr.martin');
    const emma = await login('emma');
    const emmaId = (await api().get('/api/auth/me').set(auth(emma))).body.user.id as string;
    // Emma is not linked yet: nothing to remind.
    expect((await api().post(`/api/doctor/links/${emmaId}/remind`).set(auth(doc))).status).toBe(404);
    await api().post('/api/doctor/links').set(auth(doc)).send({ email: 'emma@pharmacie.test' });
    // The first notice was just sent: a reminder now is "too soon".
    const soon = await api().post(`/api/doctor/links/${emmaId}/remind`).set(auth(doc));
    expect(soon.status).toBe(409);
    expect(soon.body.code).toBe('reminder_too_soon');
    // A day later it goes out.
    await pool.query("UPDATE notifications SET created_at = created_at - interval '2 days' WHERE user_id = $1 AND kind = 'doctor_link'", [emmaId]);
    const ok = await api().post(`/api/doctor/links/${emmaId}/remind`).set(auth(doc));
    expect(ok.status).toBe(200);
    const notes = await api().get('/api/notifications').set(auth(emma));
    expect(notes.body.items.filter((n: { kind: string }) => n.kind === 'doctor_link').length).toBeGreaterThanOrEqual(2);
    // After the patient confirms, there is nothing left to remind.
    await pool.query('UPDATE doctor_patients SET confirmed = true WHERE patient_id = $1', [emmaId]);
    expect((await api().post(`/api/doctor/links/${emmaId}/remind`).set(auth(doc))).status).toBe(409);
    // Another doctor has no link with this patient.
    const other = await login('dr.bernard');
    expect([403, 404]).toContain((await api().post(`/api/doctor/links/${emmaId}/remind`).set(auth(other))).status);
  });
});
