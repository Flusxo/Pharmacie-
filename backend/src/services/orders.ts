/** Order status machine, cancellation, stock return, and read models for patient / pharmacy / share link. */
import type pg from 'pg';
import { RULES } from '../config.js';
import { one, query, tx } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { notify } from '../notify.js';

export const ORDER_FLOW = ['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number] | 'cancelled';

/** Only forward moves, or cancel before delivery. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const STATUS_TEXT: Record<OrderStatus, string> = {
  accepted: 'accepted',
  preparing: 'being prepared',
  ready: 'ready',
  out_for_delivery: 'on its way (simulated)',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

interface OrderRow {
  id: string;
  request_id: string;
  pharmacy_id: string;
  patient_id: string;
  status: OrderStatus;
  cancel_requested_at: Date | null;
}

async function lockOrder(c: pg.PoolClient, orderId: string): Promise<OrderRow | undefined> {
  return one<OrderRow>(
    'SELECT id, request_id, pharmacy_id, patient_id, status, cancel_requested_at FROM orders WHERE id = $1 FOR UPDATE',
    [orderId],
    c,
  );
}

/** Puts the reserved quantities back into the pharmacy's stock. */
async function returnStock(c: pg.PoolClient, o: OrderRow, actorId: string): Promise<void> {
  const items = await query<{ medicine_id: string; quantity: number }>(
    'SELECT medicine_id, quantity FROM request_items WHERE request_id = $1 AND NOT excluded ORDER BY medicine_id',
    [o.request_id],
    c,
  );
  for (const i of items) {
    const before = await one<{ quantity: number }>(
      'SELECT quantity FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2 FOR UPDATE',
      [o.pharmacy_id, i.medicine_id],
      c,
    );
    if (before) {
      await c.query(
        'UPDATE pharmacy_inventory SET quantity = quantity + $3, updated_at = now() WHERE pharmacy_id = $1 AND medicine_id = $2',
        [o.pharmacy_id, i.medicine_id, i.quantity],
      );
    } else {
      await c.query('INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur) VALUES ($1,$2,$3,0)', [
        o.pharmacy_id,
        i.medicine_id,
        i.quantity,
      ]);
    }
    await c.query(
      `INSERT INTO inventory_history (pharmacy_id, medicine_id, old_qty, new_qty, reason, changed_by) VALUES ($1,$2,$3,$4,'order_cancelled',$5)`,
      [o.pharmacy_id, i.medicine_id, before?.quantity ?? 0, (before?.quantity ?? 0) + i.quantity, actorId],
    );
  }
}

async function setStatus(c: pg.PoolClient, o: OrderRow, to: OrderStatus, actorId: string): Promise<void> {
  if (to === 'cancelled') await returnStock(c, o, actorId);
  await c.query(
    `UPDATE orders SET status = $2::order_status, updated_at = now(), cancel_requested_at = CASE WHEN $3 THEN NULL ELSE cancel_requested_at END WHERE id = $1`,
    [o.id, to, to === 'cancelled'],
  );
  await c.query('INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1,$2,$3)', [o.id, to, actorId]);
  await notify(o.patient_id, 'order_status', `Update on your request: your order is ${STATUS_TEXT[to]}.`, `/orders/${o.id}`, c);
}

/** Pharmacy moves its own order. Rejects any jump that is not in NEXT_STATUS with 409. */
export async function updateOrderStatus(
  orderId: string,
  pharmacyId: string,
  to: OrderStatus,
  actorId: string,
  prescriptionChecked: boolean,
) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (!o || o.pharmacy_id !== pharmacyId) throw notFound('Order not found.');
    if (!NEXT_STATUS[o.status].includes(to)) {
      throw conflict(`An order cannot go from "${o.status}" to "${to}".`, 'invalid_transition');
    }
    if (to === 'preparing') {
      const rx = await one(
        `SELECT 1 FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id
          WHERE ri.request_id = $1 AND NOT ri.excluded AND m.requires_prescription LIMIT 1`,
        [o.request_id],
        c,
      );
      if (rx && !prescriptionChecked) {
        throw new HttpError(400, 'Confirm that you checked the prescription before preparing this order.', 'prescription_check_required');
      }
    }
    await setStatus(c, o, to, actorId);
    return { status: to };
  });
}

/** Patient cancels: directly while "accepted"; afterwards it becomes a request the pharmacy must approve. */
export async function cancelOrderByPatient(orderId: string, patientId: string) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (!o || o.patient_id !== patientId) throw notFound('Order not found.');
    if (o.status === 'accepted') {
      await setStatus(c, o, 'cancelled', patientId);
      await notify(
        o.pharmacy_id,
        'cancel_request',
        'A patient cancelled an order before preparation. The stock was returned.',
        '/pharmacy',
        c,
      );
      return { status: 'cancelled', cancellationRequested: false };
    }
    if (o.status === 'delivered' || o.status === 'cancelled') {
      throw conflict(`This order can no longer be cancelled (status: ${o.status}).`, 'not_cancellable');
    }
    if (o.cancel_requested_at) throw conflict('You already asked to cancel this order.', 'already_requested');
    await c.query('UPDATE orders SET cancel_requested_at = now(), updated_at = now() WHERE id = $1', [o.id]);
    await notify(o.pharmacy_id, 'cancel_request', 'A patient asks to cancel an order. Please approve or decline.', '/pharmacy', c);
    return { status: o.status, cancellationRequested: true };
  });
}

export async function decideCancellation(orderId: string, pharmacyId: string, approve: boolean, actorId: string) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (!o || o.pharmacy_id !== pharmacyId) throw notFound('Order not found.');
    if (!o.cancel_requested_at || o.status === 'delivered' || o.status === 'cancelled') {
      throw conflict('There is no cancellation request for this order.', 'no_cancel_request');
    }
    if (approve) {
      await setStatus(c, o, 'cancelled', actorId);
      return { status: 'cancelled' };
    }
    await c.query('UPDATE orders SET cancel_requested_at = NULL, updated_at = now() WHERE id = $1', [o.id]);
    await notify(o.patient_id, 'order_status', 'Update on your request: the pharmacy could not cancel your order.', `/orders/${o.id}`, c);
    return { status: o.status };
  });
}

const ORDER_ITEMS_SQL = `SELECT json_agg(json_build_object('id', ri.id, 'medicineId', m.id, 'name', m.name, 'dosage', m.dosage, 'form', m.form,
     'category', m.category, 'requiresPrescription', m.requires_prescription, 'quantity', ri.quantity, 'excluded', ri.excluded,
     'priceEur', i.price_eur) ORDER BY m.name)
   FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id
   LEFT JOIN pharmacy_inventory i ON i.pharmacy_id = o.pharmacy_id AND i.medicine_id = ri.medicine_id
  WHERE ri.request_id = o.request_id`;

/** Patient: own order with pharmacy, items and history. */
export async function getPatientOrder(orderId: string, patientId: string) {
  const o = await one(
    `SELECT o.id, o.request_id AS "requestId", o.status, o.cancel_requested_at AS "cancelRequestedAt", o.share_token AS "shareToken",
            o.created_at AS "createdAt", o.updated_at AS "updatedAt",
            json_build_object('id', p.user_id, 'name', p.name, 'address', p.address, 'city', p.city, 'phone', p.phone,
                              'latitude', p.latitude, 'longitude', p.longitude) AS pharmacy,
            json_build_object('latitude', pt.latitude, 'longitude', pt.longitude) AS destination,
            (${ORDER_ITEMS_SQL}) AS items,
            (SELECT json_agg(json_build_object('status', h.status, 'changedAt', h.changed_at) ORDER BY h.changed_at, h.id)
               FROM order_status_history h WHERE h.order_id = o.id) AS history
       FROM orders o JOIN pharmacies p ON p.user_id = o.pharmacy_id JOIN patients pt ON pt.user_id = o.patient_id
      WHERE o.id = $1 AND o.patient_id = $2`,
    [orderId, patientId],
  );
  if (!o) throw notFound('Order not found.');
  return o;
}

export async function listPatientOrders(patientId: string) {
  return query(
    `SELECT o.id, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.cancel_requested_at AS "cancelRequestedAt",
            p.name AS "pharmacyName", p.city AS "pharmacyCity", (${ORDER_ITEMS_SQL}) AS items
       FROM orders o JOIN pharmacies p ON p.user_id = o.pharmacy_id
      WHERE o.patient_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [patientId],
  );
}

/** Pharmacy: own orders, patient shown as "First L." only (hard rule 5). */
export async function listPharmacyOrders(pharmacyId: string, scope: 'active' | 'all') {
  return query(
    `SELECT o.id, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.cancel_requested_at AS "cancelRequestedAt",
            pt.first_name || ' ' || left(pt.last_name, 1) || '.' AS "patientName", r.source, r.instructions,
            r.prescription_note IS NOT NULL AS "hasPrescriptionNote", (${ORDER_ITEMS_SQL}) AS items,
            (SELECT json_agg(json_build_object('status', h.status, 'changedAt', h.changed_at) ORDER BY h.changed_at, h.id)
               FROM order_status_history h WHERE h.order_id = o.id) AS history
       FROM orders o JOIN patients pt ON pt.user_id = o.patient_id JOIN requests r ON r.id = o.request_id
      WHERE o.pharmacy_id = $1 AND ($2 = 'all' OR o.status NOT IN ('delivered', 'cancelled'))
      ORDER BY o.created_at DESC LIMIT 200`,
    [pharmacyId, scope],
  );
}

/** Pharmacy: one of its own orders (for the printable slip); patient as "First L." only, never an address. */
export async function getPharmacyOrder(orderId: string, pharmacyId: string) {
  const o = await one(
    `SELECT o.id, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt",
            pt.first_name || ' ' || left(pt.last_name, 1) || '.' AS "patientName", r.source, r.instructions,
            r.prescription_note IS NOT NULL AS "hasPrescriptionNote",
            json_build_object('id', p.user_id, 'name', p.name, 'address', p.address, 'city', p.city, 'phone', p.phone) AS pharmacy,
            (${ORDER_ITEMS_SQL}) AS items,
            (SELECT json_agg(json_build_object('status', h.status, 'changedAt', h.changed_at) ORDER BY h.changed_at, h.id)
               FROM order_status_history h WHERE h.order_id = o.id) AS history
       FROM orders o JOIN patients pt ON pt.user_id = o.patient_id JOIN requests r ON r.id = o.request_id
       JOIN pharmacies p ON p.user_id = o.pharmacy_id
      WHERE o.id = $1 AND o.pharmacy_id = $2`,
    [orderId, pharmacyId],
  );
  if (!o) throw notFound('Order not found.');
  return o;
}

/** Pharmacy: requests waiting for its answer (only those the patient chose it for). */
export async function listIncoming(pharmacyId: string) {
  return query(
    `SELECT r.id, r.status, r.source, r.instructions, r.prescription_note IS NOT NULL AS "hasPrescriptionNote", r.prescription_note AS "prescriptionNote",
            r.created_at AS "createdAt", rp.sent_at AS "sentAt", rp.sent_at + make_interval(mins => $2) AS "answerBy",
            pt.first_name || ' ' || left(pt.last_name, 1) || '.' AS "patientName",
            (SELECT json_agg(json_build_object('id', ri.id, 'medicineId', m.id, 'name', m.name, 'dosage', m.dosage, 'form', m.form,
                     'category', m.category, 'activeSubstance', m.active_substance, 'requiresPrescription', m.requires_prescription,
                     'quantity', ri.quantity, 'excluded', ri.excluded, 'inStock', coalesce(i.quantity, 0)) ORDER BY m.name)
               FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id
               LEFT JOIN pharmacy_inventory i ON i.pharmacy_id = rp.pharmacy_id AND i.medicine_id = ri.medicine_id
              WHERE ri.request_id = r.id) AS items
       FROM request_pharmacies rp JOIN requests r ON r.id = rp.request_id JOIN patients pt ON pt.user_id = r.patient_id
      WHERE rp.pharmacy_id = $1 AND rp.response = 'pending' AND rp.chosen_by_patient
        AND r.status IN ('sent_to_pharmacy', 'awaiting_patient_approval')
      ORDER BY rp.sent_at`,
    [pharmacyId, RULES.PHARMACY_RESPONSE_MINUTES],
  );
}

/** Public share link: status only, no personal data. Expires 2 h after delivery, or on cancellation. */
export async function getShared(token: string) {
  const o = await one<{ status: OrderStatus; updatedAt: Date }>(
    `SELECT o.status, o.updated_at AS "updatedAt", p.name AS "pharmacyName", p.city AS "pharmacyCity",
            (SELECT json_agg(json_build_object('status', h.status, 'changedAt', h.changed_at) ORDER BY h.changed_at, h.id)
               FROM order_status_history h WHERE h.order_id = o.id) AS history
       FROM orders o JOIN pharmacies p ON p.user_id = o.pharmacy_id WHERE o.share_token = $1`,
    [token],
  );
  const expired =
    !o ||
    o.status === 'cancelled' ||
    (o.status === 'delivered' && Date.now() - new Date(o.updatedAt).getTime() > RULES.SHARE_LINK_HOURS_AFTER_DELIVERY * 3600_000);
  if (expired) throw new HttpError(410, 'This tracking link has expired.', 'link_expired');
  return o;
}
