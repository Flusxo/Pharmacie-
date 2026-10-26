import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { openSlots } from '../src/services/conversations.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const TOURNON = userId.pharmacy('tournon');

/** An order at Tournon for this patient, accepted; optionally moved to ready or delivered. */
async function orderFor(patient: string, upTo: 'accepted' | 'ready' | 'delivered' = 'accepted') {
  await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(patient)]);
  const pt = await login(patient);
  const created = await api()
    .post('/api/patient/requests')
    .set(auth(pt))
    .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
  const requestId = created.body.id as string;
  await api().post(`/api/patient/requests/${requestId}/choose`).set(auth(pt)).send({ pharmacyId: TOURNON });
  const ph = await login('pharmacie.tournon');
  const orderId = (await api().post(`/api/pharmacy/requests/${requestId}/accept`).set(auth(ph)).send()).body.orderId as string;
  if (upTo !== 'accepted') {
    for (const status of ['preparing', 'ready'])
      await api().patch(`/api/pharmacy/orders/${orderId}/status`).set(auth(ph)).send({ status, prescriptionChecked: true });
  }
  if (upTo === 'delivered') {
    const code = (await pool.query('SELECT pickup_code FROM orders WHERE id = $1', [orderId])).rows[0].pickup_code as string;
    await api().post(`/api/pharmacy/orders/${orderId}/pickup`).set(auth(ph)).send({ code });
  }
  return { orderId, pt, ph };
}

describe('messages on an order', () => {
  it('patient and pharmacy exchange text; nobody else sees it; limits and moderation apply', async () => {
    const { orderId, pt, ph } = await orderFor('alice');
    const say = (t: string, body: string) => api().post(`/api/patient/orders/${orderId}/messages`).set(auth(t)).send({ body });
    expect((await say(pt, 'Bonjour, je passe en fin de journée.')).status).toBe(201);
    expect((await api().post(`/api/pharmacy/orders/${orderId}/messages`).set(auth(ph)).send({ body: 'Très bien, à tout à l’heure.' })).status).toBe(201);
    const thread = await api().get(`/api/patient/orders/${orderId}/messages`).set(auth(pt));
    expect(thread.body.items.map((m: { senderRole: string }) => m.senderRole)).toEqual(['patient', 'pharmacy']);
    expect((await api().get(`/api/pharmacy/orders/${orderId}/messages`).set(auth(ph))).body.items).toHaveLength(2);

    // Strangers get "not found", on both sides.
    expect((await api().get(`/api/patient/orders/${orderId}/messages`).set(auth(await login('bruno')))).status).toBe(404);
    expect((await api().get(`/api/pharmacy/orders/${orderId}/messages`).set(auth(await login('pharmacie.valence')))).status).toBe(404);
    expect((await say(await login('bruno'), 'hello')).status).toBe(404);

    // Empty and too long are refused.
    expect((await say(pt, '   ')).status).toBe(400);
    expect((await say(pt, 'x'.repeat(501))).status).toBe(400);

    // The other side is told, without the text.
    const notes = await api().get('/api/notifications').set(auth(pt));
    const note = notes.body.items.find((n: { kind: string }) => n.kind === 'order_message');
    expect(note).toBeTruthy();
    expect(JSON.stringify(note)).not.toMatch(/fin de journée/);

    // Report -> staff hides it -> both sides see a removed message, without its text.
    const msg = thread.body.items[0] as { id: number };
    expect((await api().post(`/api/pharmacy/messages/${msg.id}/report`).set(auth(ph)).send({ reason: 'Hors sujet' })).status).toBe(201);
    const admin = await login('admin');
    const reports = await api().get('/api/admin/reports').set(auth(admin));
    const rep = reports.body.items.find((r: { targetType: string }) => r.targetType === 'message');
    expect(rep.targetText).toMatch(/fin de journée/);
    expect((await api().post(`/api/admin/moderation/message/${msg.id}`).set(auth(await login('support'))).send({ hidden: true, reason: 'abus' })).status).toBe(403);
    expect((await api().post(`/api/admin/moderation/message/${msg.id}`).set(auth(admin)).send({ hidden: true, reason: 'Message hors sujet' })).status).toBe(200);
    const after = await api().get(`/api/patient/orders/${orderId}/messages`).set(auth(pt));
    expect(after.body.items[0]).toMatchObject({ hidden: true, body: '' });
    const logged = await pool.query("SELECT 1 FROM audit_log WHERE action = 'hide_message'");
    expect(logged.rowCount).toBe(1);
  });

  it('is rate limited, and closed once the order is cancelled', async () => {
    const { orderId, pt, ph } = await orderFor('bruno');
    let last = 201;
    for (let i = 0; i < 12; i++) last = (await api().post(`/api/patient/orders/${orderId}/messages`).set(auth(pt)).send({ body: `m${i}` })).status;
    expect(last).toBe(429);
    await api().patch(`/api/pharmacy/orders/${orderId}/status`).set(auth(ph)).send({ status: 'cancelled' });
    const closed = await api().post(`/api/pharmacy/orders/${orderId}/messages`).set(auth(ph)).send({ body: 'Désolé' });
    expect(closed.status).toBe(409);
  });
});

describe('reviews', () => {
  it('only from a delivered order, once; public, anonymous, moderated', async () => {
    const early = await orderFor('camille', 'ready');
    const review = (t: string, id: string, rating = 5, comment = 'Rapide et aimable') =>
      api().post(`/api/patient/orders/${id}/review`).set(auth(t)).send({ rating, comment });
    expect((await review(early.pt, early.orderId)).status).toBe(409); // not delivered yet

    const done = await orderFor('david', 'delivered');
    expect((await review(done.pt, done.orderId, 6)).status).toBe(400);
    const ok = await review(done.pt, done.orderId, 4, 'Très bien');
    expect(ok.status).toBe(201);
    expect((await review(done.pt, done.orderId)).status).toBe(409); // once
    expect((await review(await login('alice'), done.orderId)).status).toBe(404); // someone else's order

    const pub = await api().get(`/api/pharmacies/${TOURNON}/reviews`);
    expect(pub.status).toBe(200);
    expect(pub.body.count).toBe(1);
    expect(pub.body.average).toBe(4);
    expect(JSON.stringify(pub.body)).not.toMatch(/David|david@/);

    // The pharmacy can report it; staff hide it; the public page no longer shows it.
    expect((await api().post(`/api/pharmacy/reviews/${ok.body.id}/report`).set(auth(done.ph)).send({ reason: 'Propos injustifiés' })).status).toBe(201);
    const admin = await login('admin');
    const staffList = await api().get('/api/admin/reviews').set(auth(admin));
    expect(staffList.body.items.some((r: { id: string }) => r.id === ok.body.id)).toBe(true);
    await api().post(`/api/admin/moderation/review/${ok.body.id}`).set(auth(admin)).send({ hidden: true, reason: 'Avis abusif' });
    const hidden = await api().get(`/api/pharmacies/${TOURNON}/reviews`);
    expect(hidden.body.count).toBe(0);
    expect((await api().post(`/api/pharmacy/reviews/${ok.body.id}/report`).set(auth(await login('pharmacie.valence'))).send({ reason: 'autre' })).status).toBe(404);
  });
});

describe('review replies', () => {
  it('one reply by the pharmacy, shown under the review, reportable by the patient, hidden by staff', async () => {
    const done = await orderFor('emma', 'delivered');
    const review = await api().post(`/api/patient/orders/${done.orderId}/review`).set(auth(done.pt)).send({ rating: 3, comment: 'Correct' });
    expect(review.status).toBe(201);
    const reply = (t: string, text = 'Merci pour votre retour.') => api().post(`/api/pharmacy/reviews/${review.body.id}/reply`).set(auth(t)).send({ text });

    // Only the pharmacy the review is about, with a text of 2 to 300 characters, and once.
    expect((await reply(await login('pharmacie.valence'))).status).toBe(404);
    expect((await reply(done.ph, 'a')).status).toBe(400);
    expect((await reply(done.ph, 'x'.repeat(301))).status).toBe(400);
    expect((await reply(done.ph)).status).toBe(201);
    expect((await reply(done.ph, 'Une autre réponse')).status).toBe(409);

    // The patient is told (neutral text) and sees it; the public page shows it, still without the author.
    const own = await api().get(`/api/patient/orders/${done.orderId}/review`).set(auth(done.pt));
    expect(own.body.review.reply).toBe('Merci pour votre retour.');
    const notes = await api().get('/api/notifications').set(auth(done.pt));
    expect(notes.body.items.some((n: { kind: string }) => n.kind === 'review_reply')).toBe(true);
    const pub = await api().get(`/api/pharmacies/${TOURNON}/reviews`);
    const shown = pub.body.items.find((r: { id: string }) => r.id === review.body.id);
    expect(shown.reply).toBe('Merci pour votre retour.');
    expect(JSON.stringify(pub.body)).not.toMatch(/Emma|emma@/);

    // Only the patient who wrote the review can report the reply; staff hide it and nobody sees it any more.
    expect((await api().post(`/api/patient/orders/${done.orderId}/review/reply/report`).set(auth(await login('alice'))).send({ reason: 'Hors sujet' })).status).toBe(404);
    expect((await api().post(`/api/patient/orders/${done.orderId}/review/reply/report`).set(auth(done.pt)).send({ reason: 'Réponse déplacée' })).status).toBe(201);
    const admin = await login('admin');
    const reports = await api().get('/api/admin/reports').set(auth(admin));
    const rep = reports.body.items.find((r: { targetType: string; targetId: string }) => r.targetType === 'review_reply' && r.targetId === review.body.id);
    expect(rep.targetText).toBe('Merci pour votre retour.');
    expect((await api().post(`/api/admin/moderation/review_reply/${review.body.id}`).set(auth(admin)).send({ hidden: true, reason: 'Réponse inappropriée' })).status).toBe(200);
    const after = await api().get(`/api/pharmacies/${TOURNON}/reviews`);
    expect(after.body.items.find((r: { id: string }) => r.id === review.body.id).reply).toBeNull();
    expect((await api().get(`/api/patient/orders/${done.orderId}/review`).set(auth(done.pt))).body.review.reply).toBeNull();

    // The pharmacy can take its reply back, then answer again.
    expect((await api().delete(`/api/pharmacy/reviews/${review.body.id}/reply`).set(auth(done.ph))).status).toBe(200);
    expect((await reply(done.ph, 'Nouvelle réponse')).status).toBe(201);
  });
});

describe('time slots', () => {
  it('computes 30-minute slots inside the opening hours only', () => {
    // Monday 2026-10-26 09:00 Paris time (08:00 UTC): the pharmacy opens 08:30-12:30 and 14:00-19:30 on weekdays.
    const now = new Date('2026-10-26T08:00:00Z');
    const slots = openSlots({ mon: [['08:30', '12:30'], ['14:00', '19:30']], tue: [] }, [], now);
    expect(slots[0]).toBe('2026-10-26T08:30:00.000Z'); // 09:30 Paris: 30 minutes from now
    expect(slots).not.toContain('2026-10-26T11:30:00.000Z'); // 12:30 Paris: the interval ended
    expect(slots).not.toContain('2026-10-26T12:00:00.000Z'); // 13:00 Paris: lunch
    expect(slots).toContain('2026-10-26T13:00:00.000Z'); // 14:00 Paris
    expect(slots.every((s) => new Date(s).getTime() >= now.getTime() + 30 * 60_000)).toBe(true);
    // An on-duty day is open all day.
    expect(openSlots({}, ['tue'], new Date('2026-10-26T20:00:00Z')).some((s) => s.startsWith('2026-10-27T03:00'))).toBe(true);
  });

  it('the patient chooses one of the offered times; the pharmacy sees it; other times and late changes are refused', async () => {
    const { orderId, pt, ph } = await orderFor('emma');
    const offer = await api().get(`/api/patient/orders/${orderId}/slots`).set(auth(pt));
    expect(offer.status).toBe(200);
    // Not every demo pharmacy is open every hour of the week: make sure there is something to choose.
    await pool.query(`UPDATE pharmacies SET on_duty = '["mon","tue","wed","thu","fri","sat","sun"]'::jsonb WHERE user_id = $1`, [TOURNON]);
    const offer2 = await api().get(`/api/patient/orders/${orderId}/slots`).set(auth(pt));
    const slot = offer2.body.slots[3] as string;
    expect(slot).toBeTruthy();
    expect((await api().put(`/api/patient/orders/${orderId}/slot`).set(auth(pt)).send({ start: '2020-01-01T10:00:00.000Z', mode: 'pickup' })).status).toBe(400);
    expect((await api().put(`/api/patient/orders/${orderId}/slot`).set(auth(await login('alice'))).send({ start: slot, mode: 'pickup' })).status).toBe(404);
    expect((await api().put(`/api/patient/orders/${orderId}/slot`).set(auth(pt)).send({ start: slot, mode: 'pickup' })).status).toBe(200);
    const orders = await api().get('/api/pharmacy/orders').set(auth(ph));
    const mine = orders.body.items.find((o: { id: string }) => o.id === orderId);
    expect(new Date(mine.slotStart).toISOString()).toBe(slot);
    expect(mine.slotMode).toBe('pickup');
    const view = await api().get(`/api/patient/orders/${orderId}`).set(auth(pt));
    expect(new Date(view.body.order.slotStart).toISOString()).toBe(slot);
    // Once the order is delivered the time can no longer be changed.
    await pool.query(`UPDATE orders SET status = 'delivered' WHERE id = $1`, [orderId]);
    expect((await api().put(`/api/patient/orders/${orderId}/slot`).set(auth(pt)).send({ start: slot, mode: 'delivery' })).status).toBe(409);
  });
});
