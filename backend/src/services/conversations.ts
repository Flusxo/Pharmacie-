import { one, pool, query } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { notify } from '../notify.js';

/** Messages on an order, reviews of delivered orders, and pickup / delivery time slots. */

type Side = 'patient' | 'pharmacy';
interface OrderRow {
  id: string;
  patient_id: string;
  pharmacy_id: string;
  status: string;
  updated_at: Date;
}

/** The order, if this person is its patient or its pharmacy (pharmacyId = the pharmacy a team member works for). */
async function partyOrder(orderId: string, side: Side, actorPharmacyOrPatientId: string): Promise<OrderRow> {
  const o = await one<OrderRow>('SELECT id, patient_id, pharmacy_id, status, updated_at FROM orders WHERE id = $1', [orderId]);
  const mine = side === 'patient' ? o?.patient_id : o?.pharmacy_id;
  if (!o || mine !== actorPharmacyOrPatientId) throw notFound('Order not found.');
  return o;
}

// ---------- Messages ----------

export const MAX_MESSAGES_PER_ORDER = 100;

export async function listMessages(orderId: string, side: Side, ownerId: string) {
  await partyOrder(orderId, side, ownerId);
  const rows = await query<{ id: number; senderRole: Side; body: string; createdAt: string; hidden: boolean }>(
    `SELECT id, sender_role AS "senderRole", body, created_at AS "createdAt", hidden_at IS NOT NULL AS hidden
       FROM order_messages WHERE order_id = $1 ORDER BY id LIMIT 200`,
    [orderId],
  );
  // A message removed by moderation is shown as removed, never with its text.
  return rows.map((m) => (m.hidden ? { ...m, body: '' } : m));
}

export async function postMessage(orderId: string, side: Side, ownerId: string, senderUserId: string, body: string) {
  const o = await partyOrder(orderId, side, ownerId);
  if (o.status === 'cancelled') throw conflict('This order was cancelled: messages are closed.', 'messages_closed');
  if (o.status === 'delivered' && Date.now() - new Date(o.updated_at).getTime() > 7 * 86_400_000) {
    throw conflict('This order is closed: messages are no longer possible.', 'messages_closed');
  }
  const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM order_messages WHERE order_id = $1', [orderId]);
  if ((n?.n ?? 0) >= MAX_MESSAGES_PER_ORDER) throw conflict('This conversation is full. Call the pharmacy instead.', 'messages_full');
  const row = await one<{ id: number }>(
    'INSERT INTO order_messages (order_id, sender_user_id, sender_role, body) VALUES ($1,$2,$3,$4) RETURNING id',
    [orderId, senderUserId, side, body],
  );
  // The other side is told, without the text (a neutral notice).
  await notify(
    side === 'patient' ? o.pharmacy_id : o.patient_id,
    'order_message',
    'You have a new message about an order.',
    side === 'patient' ? '/pharmacy' : `/orders/${orderId}`,
  );
  return { id: row!.id };
}

/** A person reports a message of an order they are part of. */
export async function reportMessage(messageId: number, side: Side, ownerId: string, reporterId: string, reason: string) {
  const m = await one<{ order_id: string }>('SELECT order_id FROM order_messages WHERE id = $1', [messageId]);
  if (!m) throw notFound('Message not found.');
  await partyOrder(m.order_id, side, ownerId);
  await pool.query(
    "INSERT INTO reports (reporter_user_id, subject, message, target_type, target_id) VALUES ($1,'Message reported',$2,'message',$3)",
    [reporterId, reason, String(messageId)],
  );
}

// ---------- Reviews ----------

export async function createReview(orderId: string, patientId: string, rating: number, comment: string | null) {
  const o = await partyOrder(orderId, 'patient', patientId);
  if (o.status !== 'delivered') throw conflict('You can review an order once it is delivered.', 'not_delivered');
  const exists = await one('SELECT 1 FROM reviews WHERE order_id = $1', [orderId]);
  if (exists) throw conflict('You already reviewed this order.', 'already_reviewed');
  const r = await one<{ id: string }>(
    'INSERT INTO reviews (order_id, patient_id, pharmacy_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [orderId, patientId, o.pharmacy_id, rating, comment],
  );
  await notify(o.pharmacy_id, 'review', 'A patient left a review for your pharmacy.', '/pharmacy');
  return { id: r!.id };
}

export async function getOwnReview(orderId: string, patientId: string) {
  await partyOrder(orderId, 'patient', patientId);
  return (
    (await one<{ id: string; rating: number; comment: string | null; status: string; reply: string | null; replyAt: string | null }>(
      `SELECT id, rating, comment, status,
              CASE WHEN reply_hidden THEN NULL ELSE reply END AS reply, CASE WHEN reply_hidden THEN NULL ELSE reply_at END AS "replyAt"
         FROM reviews WHERE order_id = $1`,
      [orderId],
    )) ?? null
  );
}

/** Public: the average and the latest visible reviews of a pharmacy. Authors are never named. */
export async function pharmacyReviews(pharmacyId: string) {
  const summary = await one<{ count: number; average: number | null }>(
    "SELECT count(*)::int AS count, round(avg(rating)::numeric, 1)::float AS average FROM reviews WHERE pharmacy_id = $1 AND status = 'visible'",
    [pharmacyId],
  );
  const items = await query<{ id: string; rating: number; comment: string | null; createdAt: string; reply: string | null; replyAt: string | null }>(
    `SELECT id, rating, comment, created_at AS "createdAt",
            CASE WHEN reply_hidden THEN NULL ELSE reply END AS reply, CASE WHEN reply_hidden THEN NULL ELSE reply_at END AS "replyAt"
       FROM reviews
      WHERE pharmacy_id = $1 AND status = 'visible' ORDER BY created_at DESC LIMIT 20`,
    [pharmacyId],
  );
  return { count: summary?.count ?? 0, average: summary?.average ?? null, items };
}

/** The pharmacy reports a review it considers abusive. */
export async function reportReview(reviewId: string, pharmacyId: string, reporterId: string, reason: string) {
  const r = await one('SELECT 1 FROM reviews WHERE id = $1 AND pharmacy_id = $2', [reviewId, pharmacyId]);
  if (!r) throw notFound('Review not found.');
  await pool.query(
    "INSERT INTO reports (reporter_user_id, subject, message, target_type, target_id) VALUES ($1,'Review reported',$2,'review',$3)",
    [reporterId, reason, reviewId],
  );
}

export const MAX_REPLY = 300;

/** The pharmacy answers a visible review of its own: one reply, shown under the review, which the patient can report. */
export async function replyToReview(reviewId: string, pharmacyId: string, text: string) {
  const r = await one<{ patient_id: string; order_id: string; reply: string | null }>(
    "SELECT patient_id, order_id, reply FROM reviews WHERE id = $1 AND pharmacy_id = $2 AND status = 'visible'",
    [reviewId, pharmacyId],
  );
  if (!r) throw notFound('Review not found.');
  if (r.reply) throw conflict('You already replied to this review.', 'already_replied');
  await pool.query('UPDATE reviews SET reply = $2, reply_at = now(), reply_hidden = false WHERE id = $1', [reviewId, text]);
  await notify(r.patient_id, 'review_reply', 'The pharmacy replied to your review.', `/orders/${r.order_id}`);
}

/** The pharmacy takes its reply back (a hidden reply can be deleted too). */
export async function deleteReply(reviewId: string, pharmacyId: string) {
  const r = await pool.query(
    'UPDATE reviews SET reply = NULL, reply_at = NULL, reply_hidden = false WHERE id = $1 AND pharmacy_id = $2 AND reply IS NOT NULL',
    [reviewId, pharmacyId],
  );
  if (!r.rowCount) throw notFound('Reply not found.');
}

/** The patient who wrote the review reports the pharmacy's reply. */
export async function reportReply(reviewId: string, patientId: string, reason: string) {
  const r = await one('SELECT 1 FROM reviews WHERE id = $1 AND patient_id = $2 AND reply IS NOT NULL', [reviewId, patientId]);
  if (!r) throw notFound('Reply not found.');
  await pool.query(
    "INSERT INTO reports (reporter_user_id, subject, message, target_type, target_id) VALUES ($1,'Review reply reported',$2,'review_reply',$3)",
    [patientId, reason, reviewId],
  );
}

// ---------- Moderation (staff) ----------

/** What a report points at, for the staff inbox (the text of the message or review, and who it belongs to by role only). */
export async function reportTargets(reportRows: { target_type: string | null; target_id: string | null }[]) {
  const out = new Map<string, { text: string; hidden: boolean }>();
  for (const r of reportRows) {
    if (!r.target_type || !r.target_id) continue;
    if (r.target_type === 'message') {
      const m = await one<{ body: string; hidden: boolean }>(
        'SELECT body, hidden_at IS NOT NULL AS hidden FROM order_messages WHERE id = $1',
        [Number(r.target_id)],
      );
      if (m) out.set(`message:${r.target_id}`, { text: m.body, hidden: m.hidden });
    } else if (r.target_type === 'review_reply') {
      const m = await one<{ reply: string | null; hidden: boolean }>('SELECT reply, reply_hidden AS hidden FROM reviews WHERE id = $1', [r.target_id]);
      if (m) out.set(`review_reply:${r.target_id}`, { text: m.reply ?? '', hidden: m.hidden });
    } else {
      const m = await one<{ comment: string | null; rating: number; hidden: boolean }>(
        "SELECT comment, rating, status = 'hidden' AS hidden FROM reviews WHERE id = $1",
        [r.target_id],
      );
      if (m) out.set(`review:${r.target_id}`, { text: `${m.rating}/5${m.comment ? ` · ${m.comment}` : ''}`, hidden: m.hidden });
    }
  }
  return out;
}

export async function setHidden(type: 'message' | 'review' | 'review_reply', id: string, hidden: boolean): Promise<void> {
  const r =
    type === 'message'
      ? await pool.query('UPDATE order_messages SET hidden_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1', [Number(id), hidden])
      : type === 'review_reply'
        ? await pool.query('UPDATE reviews SET reply_hidden = $2 WHERE id = $1 AND reply IS NOT NULL', [id, hidden])
        : await pool.query("UPDATE reviews SET status = CASE WHEN $2 THEN 'hidden' ELSE 'visible' END WHERE id = $1", [id, hidden]);
  if (!r.rowCount) throw notFound('Nothing to moderate with this id.');
}

export async function latestReviews() {
  return query(
    `SELECT r.id, r.rating, r.comment, r.status, r.created_at AS "createdAt", p.name AS "pharmacyName", r.reply, r.reply_hidden AS "replyHidden"
       FROM reviews r JOIN pharmacies p ON p.user_id = r.pharmacy_id ORDER BY r.created_at DESC LIMIT 100`,
  );
}

// ---------- Time slots ----------

const TZ = 'Europe/Paris';
type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

function parisParts(d: Date): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const day = parts
    .find((p) => p.type === 'weekday')!
    .value.toLowerCase()
    .slice(0, 3) as Day;
  return { day, minutes: Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value) };
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Slots of 30 minutes inside the pharmacy's opening hours, from 30 minutes from now to 48 hours ahead. */
export function openSlots(hours: Record<string, [string, string][]>, onDuty: string[], now = new Date()): string[] {
  const out: string[] = [];
  const step = 30 * 60_000;
  const first = Math.ceil((now.getTime() + 30 * 60_000) / step) * step;
  for (let t = first; t < now.getTime() + 48 * 3_600_000; t += step) {
    const { day, minutes } = parisParts(new Date(t));
    const intervals: [string, string][] = onDuty.includes(day) ? [['00:00', '24:00']] : (hours[day] ?? []);
    if (intervals.some(([a, b]) => minutes >= toMin(a) && minutes + 30 <= toMin(b))) out.push(new Date(t).toISOString());
  }
  return out;
}

export async function slotsForOrder(orderId: string, patientId: string) {
  const o = await partyOrder(orderId, 'patient', patientId);
  const ph = await one<{ opening_hours: Record<string, [string, string][]>; on_duty: string[] }>(
    'SELECT opening_hours, on_duty FROM pharmacies WHERE user_id = $1',
    [o.pharmacy_id],
  );
  const chosen = await one<{ slot_start: string | null; slot_mode: string | null }>(
    'SELECT slot_start, slot_mode FROM orders WHERE id = $1',
    [orderId],
  );
  return {
    slots: openSlots(ph?.opening_hours ?? {}, ph?.on_duty ?? []),
    chosen: chosen?.slot_start ? { start: chosen.slot_start, mode: chosen.slot_mode } : null,
  };
}

export async function chooseSlot(orderId: string, patientId: string, start: string, mode: 'pickup' | 'delivery') {
  const o = await partyOrder(orderId, 'patient', patientId);
  if (!['accepted', 'preparing', 'ready'].includes(o.status))
    throw conflict('A time can only be chosen while the order is being prepared.', 'slot_closed');
  const { slots } = await slotsForOrder(orderId, patientId);
  const wanted = new Date(start).toISOString();
  if (!slots.includes(wanted)) throw new HttpError(400, 'This time is not available: choose one from the list.', 'slot_unavailable');
  await pool.query('UPDATE orders SET slot_start = $2, slot_mode = $3 WHERE id = $1', [orderId, wanted, mode]);
  await notify(o.pharmacy_id, 'order_slot', 'A patient chose a time for an order.', '/pharmacy');
}
