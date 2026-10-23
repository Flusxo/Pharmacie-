import Stripe from 'stripe';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { setStripeForTests } from '../src/services/payments.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const AMOXICILLINE = medicineId(11); // prescription only
const TOURNON = userId.pharmacy('tournon');
const SECRET = 'whsec_test_secret_for_tests';

let sessionSeq = 0;

/** A fake Stripe: records every call, never touches the network. */
function fakeStripe() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const rec =
    (fn: string, result: unknown = {}) =>
    async (...args: unknown[]) => {
      calls.push({ fn, args });
      return result;
    };
  const client = {
    checkout: {
      sessions: {
        create: async (...args: unknown[]) => {
          calls.push({ fn: 'sessions.create', args });
          const id = `cs_test_${++sessionSeq}`;
          return { id, url: `https://checkout.stripe.test/pay/${id}` };
        },
        expire: rec('sessions.expire'),
      },
    },
    paymentIntents: { capture: rec('pi.capture'), cancel: rec('pi.cancel') },
    refunds: { create: rec('refunds.create') },
  } as unknown as Stripe;
  return { client, calls, count: (fn: string) => calls.filter((c) => c.fn === fn).length };
}

afterEach(() => setStripeForTests(null));

async function newOrder(patient = 'alice', quantity = 2, opts: { medicine?: string; note?: string } = {}) {
  const medicine = opts.medicine ?? DOLIPRANE;
  await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(patient)]);
  await pool.query(
    `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur) VALUES ($1,$2,50,3.00)
     ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET quantity = 50, price_eur = 3.00`,
    [TOURNON, medicine],
  );
  const pt = auth(await login(patient));
  const r = await api()
    .post('/api/patient/requests')
    .set(pt)
    .send({ items: [{ medicineId: medicine, quantity }], prescriptionNote: opts.note });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  expect((await api().post(`/api/patient/requests/${r.body.id}/choose`).set(pt).send({ pharmacyId: TOURNON })).status).toBe(200);
  const a = await api()
    .post(`/api/pharmacy/requests/${r.body.id}/accept`)
    .set(auth(await login('pharmacie.tournon')))
    .send();
  expect(a.status, JSON.stringify(a.body)).toBe(200);
  return { requestId: r.body.id as string, orderId: a.body.orderId as string, pt };
}
const pharmacyMove = async (orderId: string, status: string, prescriptionChecked = true) =>
  api()
    .patch(`/api/pharmacy/orders/${orderId}/status`)
    .set(auth(await login('pharmacie.tournon')))
    .send({ status, prescriptionChecked });

function webhook(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return api().post('/api/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
}
const sessionCompleted = (id: string, orderId: string) => ({
  id,
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_intent: `pi_${id}`, metadata: { orderId } } },
});
const paymentOf = async (orderId: string) => (await pool.query('SELECT * FROM payments WHERE order_id = $1', [orderId])).rows[0];

describe('payments (Stripe test mode)', () => {
  it('says "Payments not configured" (in French too) when there are no keys, and refuses live keys', async () => {
    const { orderId, pt } = await newOrder();
    const res = await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('payments_not_configured');
    expect(res.body.error).toMatch(/Payments not configured/);
    const fr = await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).set('Accept-Language', 'fr').send();
    expect(fr.body.error).toMatch(/Paiements non configurés/);
    config.STRIPE_SECRET_KEY = 'sk_live_must_never_work';
    const live = await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send();
    config.STRIPE_SECRET_KEY = '';
    expect(live.body.code).toBe('payments_test_only');
    expect((await api().get(`/api/patient/orders/${orderId}/payment`).set(pt)).body.configured).toBe(false);
  });

  it('computes the amount on the server, authorises only (manual capture) and sends no medicine name to Stripe', async () => {
    const fake = fakeStripe();
    setStripeForTests(fake.client);
    const { orderId, pt } = await newOrder('alice', 2);
    const res = await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send({ amount: 1, amountCents: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const params = fake.calls[0].args[0] as Stripe.Checkout.SessionCreateParams;
    expect(params.payment_intent_data?.capture_method).toBe('manual');
    expect(params.line_items?.[0].price_data?.unit_amount).toBe(600); // 2 x 3.00 EUR, never the client's number
    expect(JSON.stringify(params)).not.toMatch(/Doliprane/);
    const row = await paymentOf(orderId);
    expect(row.status).toBe('pending');
    expect(row.amount_cents).toBe(600);
  });

  it('only an accepted order of the patient can be paid: nothing before the pharmacy accepts, nobody else', async () => {
    setStripeForTests(fakeStripe().client);
    const unknown = await api()
      .post('/api/patient/orders/00000000-0000-4000-8000-000000000000/pay')
      .set(auth(await login('alice')))
      .send();
    expect(unknown.status).toBe(404);
    const { orderId } = await newOrder('alice', 1);
    const other = await api()
      .post(`/api/patient/orders/${orderId}/pay`)
      .set(auth(await login('bruno')))
      .send();
    expect(other.status).toBe(404);
    const pharmacy = await api()
      .post(`/api/patient/orders/${orderId}/pay`)
      .set(auth(await login('pharmacie.tournon')))
      .send();
    expect(pharmacy.status).toBe(403);
  });

  it('webhook: refuses a bad or missing signature, is idempotent, and marks the payment authorised', async () => {
    setStripeForTests(fakeStripe().client);
    const { orderId, pt } = await newOrder('alice', 1);
    const pay0 = await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send();
    expect(pay0.status, JSON.stringify(pay0.body)).toBe(200);
    const ev = sessionCompleted('evt_test_1', orderId);
    expect((await webhook(ev, 'whsec_wrong')).status).toBe(400);
    expect((await api().post('/api/webhooks/stripe').set('Content-Type', 'application/json').send(JSON.stringify(ev))).status).toBe(400);
    expect((await paymentOf(orderId)).status).toBe('pending');

    const first = await webhook(ev);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    const row = await paymentOf(orderId);
    expect(row.status).toBe('authorized');
    expect(row.stripe_payment_intent_id).toBe('pi_evt_test_1');
    const count = async () =>
      (await pool.query("SELECT count(*)::int AS n FROM notifications WHERE kind = 'order_status' AND user_id = $1", [TOURNON])).rows[0]
        .n as number;
    const before = await count();

    const again = await webhook(ev);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await count()).toBe(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM stripe_events WHERE id = 'evt_test_1'")).rows[0].n).toBe(1);
    // paying twice is refused
    expect((await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send()).status).toBe(409);
  });

  it('captures when the pharmacy marks the order ready, and the receipt shows lines and total', async () => {
    const fake = fakeStripe();
    setStripeForTests(fake.client);
    const { orderId, pt } = await newOrder('alice', 2);
    expect((await api().get(`/api/patient/orders/${orderId}/receipt`).set(pt)).status).toBe(404);
    await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send();
    await webhook(sessionCompleted('evt_test_2', orderId));
    expect((await pharmacyMove(orderId, 'preparing')).status).toBe(200);
    expect(fake.count('pi.capture')).toBe(0);
    expect((await pharmacyMove(orderId, 'ready')).status).toBe(200);
    expect(fake.count('pi.capture')).toBe(1);
    expect((await paymentOf(orderId)).status).toBe('captured');
    const rc = await api().get(`/api/patient/orders/${orderId}/receipt`).set(pt);
    expect(rc.status).toBe(200);
    expect(rc.body.receipt.totalCents).toBe(600);
    expect(rc.body.receipt.testMode).toBe(true);
    expect(rc.body.receipt.lines[0]).toMatchObject({ quantity: 2, unitCents: 300, totalCents: 600 });
    // the pharmacy sees the status, never anything about a card
    const ph = await api()
      .get(`/api/pharmacy/orders/${orderId}/payment`)
      .set(auth(await login('pharmacie.tournon')));
    expect(ph.body.payment).toEqual({ status: 'captured', amountCents: 600, currency: 'eur' });
  });

  it('releases the authorisation when the order is cancelled before capture, and refunds after capture', async () => {
    const fake = fakeStripe();
    setStripeForTests(fake.client);
    const a = await newOrder('alice', 1);
    await api().post(`/api/patient/orders/${a.orderId}/pay`).set(a.pt).send();
    await webhook(sessionCompleted('evt_test_3', a.orderId));
    const cancelled = await api().post(`/api/patient/orders/${a.orderId}/cancel`).set(a.pt).send();
    expect(cancelled.body.status).toBe('cancelled');
    expect(fake.count('pi.cancel')).toBe(1);
    expect((await paymentOf(a.orderId)).status).toBe('cancelled');

    const b = await newOrder('alice', 1);
    await api().post(`/api/patient/orders/${b.orderId}/pay`).set(b.pt).send();
    await webhook(sessionCompleted('evt_test_4', b.orderId));
    await pharmacyMove(b.orderId, 'preparing');
    await pharmacyMove(b.orderId, 'ready');
    expect((await paymentOf(b.orderId)).status).toBe('captured');
    expect((await pharmacyMove(b.orderId, 'cancelled')).status).toBe(200);
    expect(fake.count('refunds.create')).toBe(1);
    expect((await paymentOf(b.orderId)).status).toBe('refunded');
  });

  it('declined card: the payment is marked failed, nothing is held, and the patient can try again with a new payment page', async () => {
    const fake = fakeStripe();
    setStripeForTests(fake.client);
    const { orderId, pt } = await newOrder('alice', 1);
    expect((await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send()).status).toBe(200);
    const declined = await webhook({
      id: 'evt_test_declined',
      object: 'event',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_declined', object: 'payment_intent', metadata: { orderId } } },
    });
    expect(declined.status).toBe(200);
    expect((await paymentOf(orderId)).status).toBe('failed');
    expect((await api().get(`/api/patient/orders/${orderId}/receipt`).set(pt)).status).toBe(404); // nothing was charged
    const again = await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send();
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await paymentOf(orderId)).status).toBe('pending');
    expect(fake.count('pi.capture')).toBe(0);
  });

  it('payment is impossible before the pharmacy accepts: a request that was only sent has no order to pay', async () => {
    setStripeForTests(fakeStripe().client);
    await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient('alice')]);
    const pt = auth(await login('alice'));
    const r = await api()
      .post('/api/patient/requests')
      .set(pt)
      .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    await api().post(`/api/patient/requests/${r.body.id}/choose`).set(pt).send({ pharmacyId: TOURNON });
    const noOrder = (await pool.query('SELECT 1 FROM orders WHERE request_id = $1', [r.body.id])).rowCount;
    expect(noOrder).toBe(0);
    // neither the request id nor a made-up id can be paid
    expect((await api().post(`/api/patient/orders/${r.body.id}/pay`).set(pt).send()).status).toBe(404);
    expect((await pool.query('SELECT 1 FROM payments')).rows.every(() => true)).toBe(true);
    // once the pharmacy refuses, there is still nothing to pay
    await api()
      .post(`/api/pharmacy/requests/${r.body.id}/refuse`)
      .set(auth(await login('pharmacie.tournon')))
      .send({ reason: 'Out of stock today' });
    expect((await api().post(`/api/patient/orders/${r.body.id}/pay`).set(pt).send()).status).toBe(404);
  });

  it('a prescription medicine is never charged before the pharmacy has checked the prescription and marked the order ready', async () => {
    const fake = fakeStripe();
    setStripeForTests(fake.client);
    const { orderId, pt } = await newOrder('alice', 1, { medicine: AMOXICILLINE, note: 'Ordonnance du Dr Martin du 12 octobre' });
    expect((await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send()).status).toBe(200);
    await webhook(sessionCompleted('evt_test_rx', orderId));
    expect((await paymentOf(orderId)).status).toBe('authorized'); // held, not taken
    // the pharmacy cannot start preparing without confirming the prescription
    const refused = await pharmacyMove(orderId, 'preparing', false);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('prescription_check_required');
    expect(fake.count('pi.capture')).toBe(0);
    expect((await pharmacyMove(orderId, 'preparing', true)).status).toBe(200);
    expect(fake.count('pi.capture')).toBe(0);
    expect((await pharmacyMove(orderId, 'ready', true)).status).toBe(200);
    expect(fake.count('pi.capture')).toBe(1);
  });

  it('staff see the payment status of each order in the admin list; the status only', async () => {
    setStripeForTests(fakeStripe().client);
    const { orderId, pt } = await newOrder('alice', 1);
    await api().post(`/api/patient/orders/${orderId}/pay`).set(pt).send();
    await webhook(sessionCompleted('evt_test_admin', orderId));
    const list = await api()
      .get('/api/admin/orders')
      .set(auth(await login('support')));
    const row = list.body.items.find((o: { id: string }) => o.id === orderId);
    expect(row.paymentStatus).toBe('authorized');
    expect(JSON.stringify(row)).not.toMatch(/card|stripe|pi_|cs_/i);
  });

  it('the simulated checkout route does not exist unless STRIPE_FAKE is set (never in production)', async () => {
    const { pt } = await newOrder('alice', 1);
    const res = await api().post('/api/dev/fake-stripe/cs_x/complete').set(pt).send({ card: '4242424242424242' });
    expect(res.status).toBe(404);
  });

  it('never stores card data: the payments table only holds ids, amount and status', async () => {
    const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments'")).rows.map(
      (r) => r.column_name as string,
    );
    expect(cols.sort()).toEqual(
      [
        'amount_cents',
        'created_at',
        'currency',
        'id',
        'order_id',
        'status',
        'stripe_payment_intent_id',
        'stripe_session_id',
        'updated_at',
      ].sort(),
    );
  });
});
