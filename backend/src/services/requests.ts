/**
 * Request lifecycle: create -> patient chooses a pharmacy -> pharmacy accepts (order) or refuses (back to the patient).
 * Hard rules enforced here: free choice, prescription rule, eligibility, single winner on accept.
 */
import crypto from 'node:crypto';
import type pg from 'pg';
import { RULES } from '../config.js';
import { one, query, tx } from '../db.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { notify } from '../notify.js';

export interface ItemInput {
  medicineId: string;
  quantity: number;
}

interface RequestRow {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  source: 'patient' | 'doctor';
  status: string;
  prescription_note: string | null;
}

/** Same medicine twice -> one line with the summed quantity (still max 10). */
function mergeItems(items: ItemInput[]): ItemInput[] {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.medicineId, (map.get(i.medicineId) ?? 0) + i.quantity);
  const merged = [...map.entries()].map(([medicineId, quantity]) => ({ medicineId, quantity }));
  if (merged.some((i) => i.quantity > 10)) throw badRequest('items: at most 10 boxes of the same medicine per request');
  return merged.sort((a, b) => a.medicineId.localeCompare(b.medicineId));
}

export async function createRequest(input: {
  patientId: string;
  doctorId?: string | null;
  items: ItemInput[];
  prescriptionNote?: string | null;
  instructions?: string | null;
}): Promise<{ id: string; duplicate: boolean }> {
  const items = mergeItems(input.items);
  const source = input.doctorId ? 'doctor' : 'patient';
  const note = input.prescriptionNote?.trim() || null;
  const key = crypto
    .createHash('sha256')
    .update(JSON.stringify({ source, doctor: input.doctorId ?? null, items }))
    .digest('hex');

  return tx(async (c) => {
    if (input.doctorId) {
      const link = await one<{ confirmed: boolean }>(
        'SELECT confirmed FROM doctor_patients WHERE doctor_id = $1 AND patient_id = $2',
        [input.doctorId, input.patientId],
        c,
      );
      if (!link?.confirmed) {
        throw forbidden('You can only send requests for patients who have confirmed the link with you.');
      }
    }
    const patient = await one(
      'SELECT 1 FROM patients p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 AND u.deleted_at IS NULL',
      [input.patientId],
      c,
    );
    if (!patient) throw notFound('Patient not found.');

    const meds = await query<{ id: string; requires_prescription: boolean }>(
      'SELECT id, requires_prescription FROM medicines WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
      [items.map((i) => i.medicineId)],
      c,
    );
    if (meds.length !== items.length) throw badRequest('items: one of the medicines does not exist');
    if (source === 'patient' && meds.some((m) => m.requires_prescription) && !note) {
      throw new HttpError(
        400,
        'This request contains a prescription medicine. Confirm that you will show your prescription at the pharmacy.',
        'prescription_required',
      );
    }

    // Serialise identical requests from the same patient, then apply the 2-minute idempotency window.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${input.patientId}:${key}`]);
    const existing = await one<{ id: string }>(
      `SELECT id FROM requests
        WHERE patient_id = $1 AND idempotency_key = $2 AND status NOT IN ('cancelled', 'expired')
          AND created_at > now() - make_interval(mins => $3)
        ORDER BY created_at DESC LIMIT 1`,
      [input.patientId, key, RULES.IDEMPOTENCY_WINDOW_MINUTES],
      c,
    );
    if (existing) return { id: existing.id, duplicate: true };

    const r = await one<{ id: string }>(
      `INSERT INTO requests (patient_id, doctor_id, source, prescription_note, instructions, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.patientId, input.doctorId ?? null, source, note, input.instructions?.trim() || null, key],
      c,
    );
    for (const i of items) {
      await c.query('INSERT INTO request_items (request_id, medicine_id, quantity) VALUES ($1,$2,$3)', [r!.id, i.medicineId, i.quantity]);
    }
    if (input.doctorId) {
      const d = await one<{ last_name: string }>('SELECT last_name FROM doctors WHERE user_id = $1', [input.doctorId], c);
      await notify(
        input.patientId,
        'request_sent',
        `Dr ${d?.last_name ?? ''} prepared a request for you. Choose the pharmacy you prefer.`,
        `/requests/${r!.id}`,
        c,
      );
    }
    return { id: r!.id, duplicate: false };
  });
}

async function lockRequest(c: pg.PoolClient, requestId: string): Promise<RequestRow | undefined> {
  return one<RequestRow>(
    'SELECT id, patient_id, doctor_id, source, status, prescription_note FROM requests WHERE id = $1 FOR UPDATE',
    [requestId],
    c,
  );
}

async function lockOwnRequest(c: pg.PoolClient, requestId: string, patientId: string): Promise<RequestRow> {
  const r = await lockRequest(c, requestId);
  if (!r || r.patient_id !== patientId) throw notFound('Request not found.');
  return r;
}

export interface OptionItem {
  itemId: string;
  medicineId: string;
  name: string;
  dosage: string;
  needed: number;
  available: number;
  priceEur: number | null;
}

/**
 * Pharmacies the patient may choose. `full` = every item in sufficient stock (hard rule 4);
 * `partial` = some items missing (shown as "Partially available", needs explicit confirmation).
 * Pharmacies that refused or let this request expire are excluded.
 */
export async function getOptions(requestId: string, patientId: string, loc: { lat?: number; lon?: number; radiusKm: number }) {
  const r = await one<{ status: string; latitude: number | null; longitude: number | null }>(
    `SELECT r.status, p.latitude, p.longitude FROM requests r JOIN patients p ON p.user_id = r.patient_id
      WHERE r.id = $1 AND r.patient_id = $2`,
    [requestId, patientId],
  );
  if (!r) throw notFound('Request not found.');
  const lat = loc.lat ?? r.latitude;
  const lon = loc.lon ?? r.longitude;
  const hasLoc = lat !== null && lat !== undefined && lon !== null && lon !== undefined;

  const rows = await query<{
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string | null;
    latitude: number;
    longitude: number;
    openingHours: unknown;
    onDuty: unknown;
    distanceKm: number | null;
    items: OptionItem[];
  }>(
    `WITH it AS (
       SELECT ri.id, ri.medicine_id, ri.quantity, m.name, m.dosage
         FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id WHERE ri.request_id = $1
     )
     SELECT ep.user_id AS id, ep.name, ep.address, ep.city, ep.phone, ep.latitude, ep.longitude,
            ep.opening_hours AS "openingHours", ep.on_duty AS "onDuty",
            CASE WHEN $2::float8 IS NULL THEN NULL ELSE round(haversine_km($2, $3, ep.latitude, ep.longitude)::numeric, 2)::float END AS "distanceKm",
            json_agg(json_build_object('itemId', it.id, 'medicineId', it.medicine_id, 'name', it.name, 'dosage', it.dosage,
                     'needed', it.quantity, 'available', coalesce(i.quantity, 0), 'priceEur', i.price_eur) ORDER BY it.name) AS items
       FROM eligible_pharmacies ep
       CROSS JOIN it
       LEFT JOIN pharmacy_inventory i ON i.pharmacy_id = ep.user_id AND i.medicine_id = it.medicine_id
      WHERE NOT EXISTS (SELECT 1 FROM request_pharmacies rp WHERE rp.request_id = $1 AND rp.pharmacy_id = ep.user_id
                          AND rp.response IN ('refused', 'expired'))
        AND ($2::float8 IS NULL OR haversine_km($2, $3, ep.latitude, ep.longitude) <= $4)
      GROUP BY ep.user_id, ep.name, ep.address, ep.city, ep.phone, ep.latitude, ep.longitude, ep.opening_hours, ep.on_duty
      ORDER BY 10 NULLS LAST, ep.name`,
    [requestId, hasLoc ? lat : null, hasLoc ? lon : null, loc.radiusKm],
  );

  const full = [];
  const partial = [];
  for (const p of rows) {
    const missing = p.items.filter((i) => i.available < i.needed);
    const totalPriceEur =
      Math.round(p.items.filter((i) => i.available >= i.needed).reduce((s, i) => s + (i.priceEur ?? 0) * i.needed, 0) * 100) / 100;
    if (missing.length === 0) full.push({ ...p, totalPriceEur, missing: [] });
    else if (missing.length < p.items.length) partial.push({ ...p, totalPriceEur, missing });
  }
  return { status: r.status, canChoose: r.status === 'received', usedLocation: hasLoc ? { lat, lon } : null, full, partial };
}

export async function choosePharmacy(requestId: string, patientId: string, pharmacyId: string, acceptPartial: boolean) {
  return tx(async (c) => {
    const r = await lockOwnRequest(c, requestId, patientId);
    if (r.status !== 'received') {
      throw conflict(`This request is not waiting for a pharmacy choice (status: ${r.status}).`, 'not_choosable');
    }
    const ph = await one<{ name: string }>('SELECT name FROM eligible_pharmacies WHERE user_id = $1', [pharmacyId], c);
    if (!ph) throw conflict('This pharmacy cannot take requests right now. Please choose another one.', 'pharmacy_unavailable');
    const prior = await one<{ response: string }>(
      'SELECT response FROM request_pharmacies WHERE request_id = $1 AND pharmacy_id = $2',
      [requestId, pharmacyId],
      c,
    );
    if (prior && (prior.response === 'refused' || prior.response === 'expired')) {
      throw conflict('This pharmacy already declined this request. Please choose another one.', 'already_declined');
    }

    const items = await query<{ id: string; quantity: number; available: number }>(
      `SELECT ri.id, ri.quantity, coalesce(i.quantity, 0) AS available
         FROM request_items ri LEFT JOIN pharmacy_inventory i ON i.pharmacy_id = $2 AND i.medicine_id = ri.medicine_id
        WHERE ri.request_id = $1`,
      [requestId, pharmacyId],
      c,
    );
    const missing = items.filter((i) => i.available < i.quantity).map((i) => i.id);
    if (missing.length === items.length) {
      throw conflict('This pharmacy does not have these medicines in stock.', 'not_in_stock');
    }
    if (missing.length > 0 && !acceptPartial) {
      throw conflict(
        'This pharmacy has only part of your request. Confirm that the missing items will not be included.',
        'partial_requires_confirmation',
      );
    }
    await c.query('UPDATE request_items SET excluded = (id = ANY($2::uuid[])) WHERE request_id = $1', [requestId, missing]);
    await c.query(
      `INSERT INTO request_pharmacies (request_id, pharmacy_id, chosen_by_patient, response, sent_at)
       VALUES ($1,$2,true,'pending',now())
       ON CONFLICT (request_id, pharmacy_id) DO UPDATE SET chosen_by_patient = true, response = 'pending', sent_at = now(), responded_at = NULL`,
      [requestId, pharmacyId],
    );
    await c.query(`UPDATE requests SET status = 'sent_to_pharmacy', updated_at = now() WHERE id = $1`, [requestId]);
    await notify(
      pharmacyId,
      'request_received',
      `New request from a patient. Please answer within ${RULES.PHARMACY_RESPONSE_MINUTES} minutes.`,
      '/pharmacy',
      c,
    );
    await notify(patientId, 'request_sent', `Your request was sent to ${ph.name}.`, `/requests/${requestId}`, c);
    return { status: 'sent_to_pharmacy', excludedItems: missing.length };
  });
}

/**
 * Pharmacy accepts: ONE transaction. Locks the request row, re-checks status and choice, locks and
 * re-checks stock for every item, decrements stock, creates the order. Concurrent accepts: exactly one wins.
 */
export async function acceptRequest(requestId: string, pharmacyId: string, actorId: string): Promise<{ orderId: string }> {
  return tx(async (c) => {
    const r = await lockRequest(c, requestId);
    if (!r) throw notFound('Request not found.');
    const rp = await one<{ response: string; chosen_by_patient: boolean }>(
      'SELECT response, chosen_by_patient FROM request_pharmacies WHERE request_id = $1 AND pharmacy_id = $2',
      [requestId, pharmacyId],
      c,
    );
    if (!rp) throw notFound('Request not found.');
    if (r.status !== 'sent_to_pharmacy') {
      throw conflict('This request is no longer waiting for a pharmacy.', 'not_available');
    }
    if (rp.response !== 'pending' || !rp.chosen_by_patient) {
      throw conflict('This request is not waiting for your answer.', 'not_chosen');
    }
    const ph = await one<{ paused: boolean; name: string }>('SELECT paused, name FROM pharmacies WHERE user_id = $1', [pharmacyId], c);
    if (ph?.paused) throw conflict('Your pharmacy is marked "all out of stock". Switch it back on before accepting.', 'paused');

    const items = await query<{ id: string; medicine_id: string; quantity: number; requires_prescription: boolean }>(
      `SELECT ri.id, ri.medicine_id, ri.quantity, m.requires_prescription
         FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id
        WHERE ri.request_id = $1 AND NOT ri.excluded ORDER BY ri.medicine_id`,
      [requestId],
      c,
    );
    if (items.some((i) => i.requires_prescription) && r.source === 'patient' && !r.prescription_note) {
      throw conflict('A prescription medicine is in this request without the prescription statement.', 'prescription_required');
    }
    for (const i of items) {
      const stock = await one<{ quantity: number }>(
        'SELECT quantity FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2 FOR UPDATE',
        [pharmacyId, i.medicine_id],
        c,
      );
      if (!stock || stock.quantity < i.quantity) {
        throw conflict('Not enough stock for one of the items. Update your stock or refuse the request.', 'insufficient_stock');
      }
      await c.query(
        'UPDATE pharmacy_inventory SET quantity = quantity - $3, updated_at = now() WHERE pharmacy_id = $1 AND medicine_id = $2',
        [pharmacyId, i.medicine_id, i.quantity],
      );
      await c.query(
        `INSERT INTO inventory_history (pharmacy_id, medicine_id, old_qty, new_qty, reason, changed_by) VALUES ($1,$2,$3,$4,'order_reserved',$5)`,
        [pharmacyId, i.medicine_id, stock.quantity, stock.quantity - i.quantity, actorId],
      );
    }
    const order = await one<{ id: string }>(
      `INSERT INTO orders (request_id, pharmacy_id, patient_id, status, share_token) VALUES ($1,$2,$3,'accepted',$4) RETURNING id`,
      [requestId, pharmacyId, r.patient_id, crypto.randomBytes(16).toString('hex')],
      c,
    );
    await c.query(`INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1,'accepted',$2)`, [order!.id, actorId]);
    await c.query(`UPDATE request_pharmacies SET response = 'accepted', responded_at = now() WHERE request_id = $1 AND pharmacy_id = $2`, [
      requestId,
      pharmacyId,
    ]);
    await c.query(`UPDATE requests SET status = 'accepted', updated_at = now() WHERE id = $1`, [requestId]);
    await notify(r.patient_id, 'request_accepted', `${ph?.name ?? 'The pharmacy'} accepted your request.`, `/orders/${order!.id}`, c);
    return { orderId: order!.id };
  });
}

/** Refusal: the request goes back to the patient, who chooses another pharmacy. */
export async function refuseRequest(requestId: string, pharmacyId: string, reason: string | null) {
  return tx(async (c) => {
    const r = await lockRequest(c, requestId);
    if (!r) throw notFound('Request not found.');
    const rp = await one<{ response: string }>(
      'SELECT response FROM request_pharmacies WHERE request_id = $1 AND pharmacy_id = $2',
      [requestId, pharmacyId],
      c,
    );
    if (!rp) throw notFound('Request not found.');
    if (rp.response !== 'pending' || !['sent_to_pharmacy', 'awaiting_patient_approval'].includes(r.status)) {
      throw conflict('This request is not waiting for your answer.', 'not_chosen');
    }
    await c.query(
      `UPDATE request_pharmacies SET response = 'refused', responded_at = now(), refusal_reason = $3 WHERE request_id = $1 AND pharmacy_id = $2`,
      [requestId, pharmacyId, reason],
    );
    await c.query(`UPDATE substitutions SET status = 'declined', decided_at = now() WHERE request_id = $1 AND status = 'pending'`, [
      requestId,
    ]);
    await c.query('UPDATE request_items SET excluded = false WHERE request_id = $1', [requestId]);
    await c.query(`UPDATE requests SET status = 'received', updated_at = now() WHERE id = $1`, [requestId]);
    await notify(
      r.patient_id,
      'request_refused',
      'The pharmacy could not take your request. Please choose another pharmacy.',
      `/requests/${requestId}`,
      c,
    );
    return { status: 'received' };
  });
}

/** Pharmacy proposes a generic (same substance and dosage) for one item; the patient must approve. */
export async function proposeSubstitution(requestId: string, pharmacyId: string, itemId: string, proposedMedicineId: string) {
  return tx(async (c) => {
    const r = await lockRequest(c, requestId);
    if (!r) throw notFound('Request not found.');
    const rp = await one<{ response: string }>(
      'SELECT response FROM request_pharmacies WHERE request_id = $1 AND pharmacy_id = $2',
      [requestId, pharmacyId],
      c,
    );
    if (!rp) throw notFound('Request not found.');
    if (r.status !== 'sent_to_pharmacy' || rp.response !== 'pending') {
      throw conflict('This request is not waiting for your answer.', 'not_chosen');
    }
    const item = await one<{ medicine_id: string; quantity: number }>(
      'SELECT medicine_id, quantity FROM request_items WHERE id = $1 AND request_id = $2 AND NOT excluded',
      [itemId, requestId],
      c,
    );
    if (!item) throw notFound('Item not found in this request.');
    const generic = await one(
      `SELECT 1 FROM medicines o JOIN medicines g ON g.id = $2
        WHERE o.id = $1 AND g.id <> o.id AND g.deleted_at IS NULL
          AND f_norm(g.active_substance) = f_norm(o.active_substance) AND f_norm(g.dosage) = f_norm(o.dosage)`,
      [item.medicine_id, proposedMedicineId],
      c,
    );
    if (!generic) throw badRequest('The proposed medicine must have the same active substance and dosage.');
    const stock = await one<{ quantity: number }>(
      'SELECT quantity FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2',
      [pharmacyId, proposedMedicineId],
      c,
    );
    if (!stock || stock.quantity < item.quantity)
      throw conflict('You do not have enough stock of the proposed medicine.', 'insufficient_stock');
    const s = await one<{ id: string }>(
      `INSERT INTO substitutions (request_id, request_item_id, pharmacy_id, original_medicine_id, proposed_medicine_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [requestId, itemId, pharmacyId, item.medicine_id, proposedMedicineId],
      c,
    );
    await c.query(`UPDATE requests SET status = 'awaiting_patient_approval', updated_at = now() WHERE id = $1`, [requestId]);
    await notify(
      r.patient_id,
      'substitution',
      'The pharmacy proposes an equivalent generic. Please approve or decline.',
      `/requests/${requestId}`,
      c,
    );
    return { substitutionId: s!.id, status: 'awaiting_patient_approval' };
  });
}

export async function decideSubstitution(requestId: string, patientId: string, substitutionId: string, approve: boolean) {
  return tx(async (c) => {
    const r = await lockOwnRequest(c, requestId, patientId);
    if (r.status !== 'awaiting_patient_approval') throw conflict('There is no proposal waiting for your answer.', 'no_proposal');
    const s = await one<{ request_item_id: string; proposed_medicine_id: string; pharmacy_id: string }>(
      `SELECT request_item_id, proposed_medicine_id, pharmacy_id FROM substitutions WHERE id = $1 AND request_id = $2 AND status = 'pending'`,
      [substitutionId, requestId],
      c,
    );
    if (!s) throw notFound('Proposal not found.');
    if (approve) {
      await c.query('UPDATE request_items SET medicine_id = $2 WHERE id = $1', [s.request_item_id, s.proposed_medicine_id]);
    }
    await c.query('UPDATE substitutions SET status = $2, decided_at = now() WHERE id = $1', [
      substitutionId,
      approve ? 'approved' : 'declined',
    ]);
    await c.query(`UPDATE requests SET status = 'sent_to_pharmacy', updated_at = now() WHERE id = $1`, [requestId]);
    // A fresh response window for the pharmacy.
    await c.query(`UPDATE request_pharmacies SET sent_at = now() WHERE request_id = $1 AND pharmacy_id = $2 AND response = 'pending'`, [
      requestId,
      s.pharmacy_id,
    ]);
    await notify(
      s.pharmacy_id,
      'substitution',
      approve ? 'The patient approved the generic you proposed.' : 'The patient declined the generic you proposed.',
      '/pharmacy',
      c,
    );
    return { status: 'sent_to_pharmacy', approved: approve };
  });
}

/** Patient cancels a request that has no order yet. */
export async function cancelRequest(requestId: string, patientId: string) {
  return tx(async (c) => {
    const r = await lockOwnRequest(c, requestId, patientId);
    if (r.status === 'accepted') throw conflict('This request already has an order. Cancel the order instead.', 'has_order');
    if (!['received', 'sent_to_pharmacy', 'awaiting_patient_approval'].includes(r.status)) {
      throw conflict(`This request can no longer be cancelled (status: ${r.status}).`, 'not_cancellable');
    }
    const pending = await query<{ pharmacy_id: string }>(
      `UPDATE request_pharmacies SET response = 'expired', responded_at = now(), refusal_reason = 'cancelled by patient'
        WHERE request_id = $1 AND response = 'pending' RETURNING pharmacy_id`,
      [requestId],
      c,
    );
    await c.query(`UPDATE substitutions SET status = 'declined', decided_at = now() WHERE request_id = $1 AND status = 'pending'`, [
      requestId,
    ]);
    await c.query(`UPDATE requests SET status = 'cancelled', updated_at = now() WHERE id = $1`, [requestId]);
    for (const p of pending) await notify(p.pharmacy_id, 'request_refused', 'A patient cancelled a request sent to you.', '/pharmacy', c);
    return { status: 'cancelled' };
  });
}

/** Patient view of one request (own requests only). */
export async function getPatientRequest(requestId: string, patientId: string) {
  const r = await one(
    `SELECT r.id, r.status, r.source, r.prescription_note AS "prescriptionNote", r.instructions, r.created_at AS "createdAt",
            r.updated_at AS "updatedAt", d.first_name || ' ' || d.last_name AS "doctorName", o.id AS "orderId", o.status AS "orderStatus"
       FROM requests r
       LEFT JOIN doctors d ON d.user_id = r.doctor_id
       LEFT JOIN orders o ON o.request_id = r.id
      WHERE r.id = $1 AND r.patient_id = $2`,
    [requestId, patientId],
  );
  if (!r) throw notFound('Request not found.');
  const items = await query(
    `SELECT ri.id, ri.quantity, ri.excluded, m.id AS "medicineId", m.name, m.dosage, m.form, m.category,
            m.requires_prescription AS "requiresPrescription", m.image_url AS "imageUrl"
       FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id WHERE ri.request_id = $1 ORDER BY m.name`,
    [requestId],
  );
  const pharmacies = await query(
    `SELECT p.user_id AS id, p.name, p.city, rp.response, rp.sent_at AS "sentAt", rp.responded_at AS "respondedAt",
            rp.sent_at + make_interval(mins => $2) AS "answerBy"
       FROM request_pharmacies rp JOIN pharmacies p ON p.user_id = rp.pharmacy_id
      WHERE rp.request_id = $1 ORDER BY rp.sent_at DESC`,
    [requestId, RULES.PHARMACY_RESPONSE_MINUTES],
  );
  const substitution = await one(
    `SELECT s.id, s.request_item_id AS "itemId", o.name AS "originalName", g.name AS "proposedName", g.dosage AS "proposedDosage"
       FROM substitutions s JOIN medicines o ON o.id = s.original_medicine_id JOIN medicines g ON g.id = s.proposed_medicine_id
      WHERE s.request_id = $1 AND s.status = 'pending'`,
    [requestId],
  );
  return { ...r, items, pharmacies, substitution: substitution ?? null };
}

export async function listPatientRequests(patientId: string) {
  return query(
    `SELECT r.id, r.status, r.source, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
            o.id AS "orderId", o.status AS "orderStatus",
            (SELECT p.name FROM request_pharmacies rp JOIN pharmacies p ON p.user_id = rp.pharmacy_id
              WHERE rp.request_id = r.id AND rp.response IN ('pending', 'accepted') ORDER BY rp.sent_at DESC LIMIT 1) AS "pharmacyName",
            (SELECT json_agg(json_build_object('name', m.name, 'dosage', m.dosage, 'form', m.form, 'category', m.category, 'quantity', ri.quantity) ORDER BY m.name)
               FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id WHERE ri.request_id = r.id) AS items
       FROM requests r LEFT JOIN orders o ON o.request_id = r.id
      WHERE r.patient_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
    [patientId],
  );
}
