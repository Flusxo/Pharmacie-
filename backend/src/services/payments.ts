/**
 * Stripe payments, TEST MODE only. The patient pays on Stripe's own hosted page (Checkout): card data never touches
 * our server or database, we only store ids, amount and status. Flow: the pharmacy accepts (the order exists) ->
 * the patient pays, the amount is only AUTHORISED -> the pharmacy marks the order "ready" -> the payment is CAPTURED.
 * Cancelling releases the authorisation (not yet captured) or refunds it (captured). Webhooks are signature-checked
 * and idempotent.
 */
import Stripe from 'stripe';
import { PRIMARY_FRONTEND, config } from '../config.js';
import { one, query, tx } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { log } from '../logger.js';
import { notify } from '../notify.js';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'cancelled' | 'refunded' | 'failed' | 'capture_failed';

let injected: Stripe | null = null;
let cached: { key: string; client: Stripe } | null = null;
/** Tests replace the Stripe client with a fake (no network). */
export function setStripeForTests(c: Stripe | null): void {
  injected = c;
}

export const paymentsConfigured = () => injected !== null || Boolean(config.STRIPE_SECRET_KEY);

export function stripeClient(): Stripe {
  if (injected) return injected;
  const key = config.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpError(503, 'Payments not configured. Ask the administrator to set the Stripe test keys.', 'payments_not_configured');
  }
  if (!key.startsWith('sk_test_')) {
    throw new HttpError(503, 'Only Stripe test keys are accepted: this prototype never handles real money.', 'payments_test_only');
  }
  if (!cached || cached.key !== key) cached = { key, client: new Stripe(key) };
  return cached.client;
}

interface PaymentRow {
  id: string;
  order_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  status: PaymentStatus;
}

interface OrderLine {
  name: string;
  dosage: string;
  quantity: number;
  unitCents: number;
}

/** The amount is always computed here from the pharmacy's own prices: the browser never sends one. */
async function orderLines(orderId: string): Promise<OrderLine[]> {
  return query<OrderLine>(
    `SELECT m.name, m.dosage, ri.quantity, round(coalesce(i.price_eur, 0) * 100)::int AS "unitCents"
       FROM orders o JOIN request_items ri ON ri.request_id = o.request_id AND NOT ri.excluded
       JOIN medicines m ON m.id = ri.medicine_id
       LEFT JOIN pharmacy_inventory i ON i.pharmacy_id = o.pharmacy_id AND i.medicine_id = ri.medicine_id
      WHERE o.id = $1 ORDER BY m.name`,
    [orderId],
  );
}
export const totalCents = (lines: OrderLine[]) => lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);

const PAYABLE = ['accepted', 'preparing', 'ready', 'out_for_delivery'];

/** Patient: creates a Stripe Checkout page (authorisation only) for an accepted order and returns its address. */
export async function startPayment(orderId: string, patientId: string): Promise<{ url: string }> {
  const stripe = stripeClient();
  const o = await one<{ id: string; status: string; pharmacy_name: string }>(
    `SELECT o.id, o.status, p.name AS pharmacy_name FROM orders o JOIN pharmacies p ON p.user_id = o.pharmacy_id
      WHERE o.id = $1 AND o.patient_id = $2`,
    [orderId, patientId],
  );
  if (!o) throw notFound('Order not found.');
  if (!PAYABLE.includes(o.status)) throw conflict('This order can no longer be paid.', 'not_payable');
  const existing = await one<PaymentRow>('SELECT * FROM payments WHERE order_id = $1', [orderId]);
  if (existing && (existing.status === 'authorized' || existing.status === 'captured')) {
    throw conflict('This order is already paid.', 'already_paid');
  }
  const amount = totalCents(await orderLines(orderId));
  if (amount <= 0) throw new HttpError(400, 'Nothing to pay: the pharmacy has not set a price for this order.', 'nothing_to_pay');

  const short = orderId.slice(0, 8);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: orderId,
    metadata: { orderId },
    // Authorise now, capture when the pharmacy marks the order ready. No medicine names go to Stripe.
    payment_intent_data: { capture_method: 'manual', metadata: { orderId } },
    line_items: [
      {
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: amount, product_data: { name: `counter. order ${short} — ${o.pharmacy_name}` } },
      },
    ],
    success_url: `${PRIMARY_FRONTEND}/orders/${orderId}?payment=return`,
    cancel_url: `${PRIMARY_FRONTEND}/orders/${orderId}?payment=cancelled`,
  });
  await query(
    `INSERT INTO payments (order_id, stripe_session_id, amount_cents, status) VALUES ($1,$2,$3,'pending')
     ON CONFLICT (order_id) DO UPDATE SET stripe_session_id = $2, stripe_payment_intent_id = NULL, amount_cents = $3,
       status = 'pending', updated_at = now()`,
    [orderId, session.id, amount],
  );
  if (!session.url) throw new HttpError(502, 'The payment page could not be created. Please try again.', 'payment_page_failed');
  return { url: session.url };
}

/** Payment status of an order, for its patient or its pharmacy (never card data: we do not have any). */
export async function getPayment(orderId: string, who: { patientId?: string; pharmacyId?: string }) {
  const o = await one<{ id: string }>(
    `SELECT id FROM orders WHERE id = $1 AND (($2::uuid IS NOT NULL AND patient_id = $2) OR ($3::uuid IS NOT NULL AND pharmacy_id = $3))`,
    [orderId, who.patientId ?? null, who.pharmacyId ?? null],
  );
  if (!o) throw notFound('Order not found.');
  const p = await one<PaymentRow>('SELECT * FROM payments WHERE order_id = $1', [orderId]);
  return {
    configured: paymentsConfigured(),
    testMode: true,
    payment: p ? { status: p.status, amountCents: p.amount_cents, currency: 'eur' } : null,
  };
}

/** Receipt for the patient once the payment is authorised, captured or refunded. */
export async function getReceipt(orderId: string, patientId: string) {
  const o = await one<{ id: string; created_at: Date; name: string; address: string; city: string }>(
    `SELECT o.id, o.created_at, p.name, p.address, p.city FROM orders o JOIN pharmacies p ON p.user_id = o.pharmacy_id
      WHERE o.id = $1 AND o.patient_id = $2`,
    [orderId, patientId],
  );
  if (!o) throw notFound('Order not found.');
  const p = await one<PaymentRow & { updated_at: Date }>('SELECT * FROM payments WHERE order_id = $1', [orderId]);
  if (!p || !['authorized', 'captured', 'refunded'].includes(p.status)) throw notFound('There is no receipt for this order yet.');
  const lines = await orderLines(orderId);
  return {
    receipt: {
      number: `R-${orderId.slice(0, 8).toUpperCase()}`,
      orderId,
      date: p.updated_at,
      pharmacy: { name: o.name, address: o.address, city: o.city },
      lines: lines.map((l) => ({ ...l, totalCents: l.unitCents * l.quantity })),
      totalCents: p.amount_cents,
      currency: 'eur',
      status: p.status,
      testMode: true,
    },
  };
}

async function setStatus(orderId: string, status: PaymentStatus): Promise<void> {
  await query('UPDATE payments SET status = $2, updated_at = now() WHERE order_id = $1', [orderId, status]);
}

/** The order is ready: capture the authorised amount. A failure is recorded and logged, never thrown into the order flow. */
export async function onOrderReady(orderId: string): Promise<void> {
  const p = await one<PaymentRow>("SELECT * FROM payments WHERE order_id = $1 AND status = 'authorized'", [orderId]);
  if (!p?.stripe_payment_intent_id) return;
  try {
    await stripeClient().paymentIntents.capture(p.stripe_payment_intent_id, undefined, { idempotencyKey: `capture-${orderId}` });
    await setStatus(orderId, 'captured');
  } catch (err) {
    await setStatus(orderId, 'capture_failed');
    log('error', 'payment_capture_failed', { orderId, error: (err as Error).message.slice(0, 200) });
  }
}

/** The order is cancelled: release the authorisation, or refund what was captured. */
export async function onOrderCancelled(orderId: string): Promise<void> {
  const p = await one<PaymentRow>('SELECT * FROM payments WHERE order_id = $1', [orderId]);
  if (!p) return;
  try {
    const stripe = stripeClient();
    if (p.status === 'authorized' && p.stripe_payment_intent_id) {
      await stripe.paymentIntents.cancel(p.stripe_payment_intent_id, undefined, { idempotencyKey: `cancel-${orderId}` });
      await setStatus(orderId, 'cancelled');
    } else if (p.status === 'captured' && p.stripe_payment_intent_id) {
      await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id }, { idempotencyKey: `refund-${orderId}` });
      await setStatus(orderId, 'refunded');
    } else if (p.status === 'pending' && p.stripe_session_id) {
      await stripe.checkout.sessions.expire(p.stripe_session_id).catch(() => undefined);
      await setStatus(orderId, 'cancelled');
    }
  } catch (err) {
    log('error', 'payment_release_failed', { orderId, error: (err as Error).message.slice(0, 200) });
  }
}

/**
 * Stripe webhook. `raw` is the unparsed body (the signature covers the exact bytes). Each event id is handled once;
 * if handling fails the event row is rolled back, so Stripe's retry is processed again.
 */
export async function handleWebhook(raw: Buffer, signature: string | undefined): Promise<'ok' | 'duplicate' | 'bad_signature'> {
  const secret = config.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) return 'bad_signature';
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return 'bad_signature';
  }
  let duplicate = false;
  await tx(async (c) => {
    const ins = await c.query('INSERT INTO stripe_events (id, type) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING', [event.id, event.type]);
    if (ins.rowCount === 0) {
      duplicate = true;
      return;
    }
    await applyEvent(event);
  });
  return duplicate ? 'duplicate' : 'ok';
}

function orderIdOf(obj: { metadata?: Stripe.Metadata | null }): string | undefined {
  const id = obj.metadata?.orderId;
  return id && /^[0-9a-f-]{36}$/.test(id) ? id : undefined;
}

async function applyEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const orderId = orderIdOf(s);
      if (!orderId) return;
      const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
      // With manual capture the money is held, not taken: "authorized".
      await query(
        `UPDATE payments SET stripe_payment_intent_id = $2,
                status = CASE WHEN status IN ('captured','refunded') THEN status ELSE 'authorized' END, updated_at = now()
          WHERE order_id = $1`,
        [orderId, pi ?? null],
      );
      const o = await one<{ status: string; pharmacy_id: string }>('SELECT status, pharmacy_id FROM orders WHERE id = $1', [orderId]);
      if (!o) return;
      await notify(
        o.pharmacy_id,
        'order_status',
        'A patient paid an order (test mode). The amount is held until the order is ready.',
        '/pharmacy',
      );
      if (o.status === 'ready' || o.status === 'out_for_delivery') await onOrderReady(orderId);
      return;
    }
    case 'payment_intent.payment_failed': {
      const orderId = orderIdOf(event.data.object);
      if (orderId)
        await query("UPDATE payments SET status = 'failed', updated_at = now() WHERE order_id = $1 AND status = 'pending'", [orderId]);
      return;
    }
    case 'payment_intent.succeeded': {
      const orderId = orderIdOf(event.data.object);
      if (orderId) await setStatus(orderId, 'captured');
      return;
    }
    case 'payment_intent.canceled': {
      const orderId = orderIdOf(event.data.object);
      if (orderId)
        await query("UPDATE payments SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status <> 'refunded'", [orderId]);
      return;
    }
    case 'charge.refunded': {
      const orderId = orderIdOf(event.data.object);
      if (orderId) await setStatus(orderId, 'refunded');
      return;
    }
    default:
      return;
  }
}
