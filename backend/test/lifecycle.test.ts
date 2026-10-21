import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { runExpiryJob } from '../src/services/lifecycle.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const PARACETAMOL_GENERIC = medicineId(1);
const ADVIL = medicineId(3);
const ZYRTEC = medicineId(5);
const AMOXICILLINE = medicineId(11); // prescription
const TOURNON = userId.pharmacy('tournon');
const VALENCE = userId.pharmacy('valence');
const ROMANS = userId.pharmacy('romans');

const tokenOf = (who: string) => login(who);

async function stock(pharmacyId: string, medId: string): Promise<number | null> {
  const r = await pool.query('SELECT quantity FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2', [pharmacyId, medId]);
  return r.rows[0]?.quantity ?? null;
}
async function setStock(pharmacyId: string, medId: string, quantity: number): Promise<void> {
  await pool.query(
    `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur) VALUES ($1,$2,$3,3)
     ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET quantity = $3`,
    [pharmacyId, medId, quantity],
  );
}

/** Creates a request as a patient. Older requests are aged past the 2-minute idempotency window so each call is new. */
async function newRequest(patient: string, items: { medicineId: string; quantity: number }[], prescriptionNote?: string) {
  await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(patient)]);
  const res = await api()
    .post('/api/patient/requests')
    .set(auth(await tokenOf(patient)))
    .send({ items, prescriptionNote });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}
const choose = async (patient: string, requestId: string, pharmacyId: string, acceptPartial = false) =>
  api()
    .post(`/api/patient/requests/${requestId}/choose`)
    .set(auth(await tokenOf(patient)))
    .send({ pharmacyId, acceptPartial });
const accept = async (pharmacy: string, requestId: string) =>
  api()
    .post(`/api/pharmacy/requests/${requestId}/accept`)
    .set(auth(await tokenOf(`pharmacie.${pharmacy}`)))
    .send();
const move = async (pharmacy: string, orderId: string, status: string, prescriptionChecked = false) =>
  api()
    .patch(`/api/pharmacy/orders/${orderId}/status`)
    .set(auth(await tokenOf(`pharmacie.${pharmacy}`)))
    .send({ status, prescriptionChecked });

/** Request -> Tournon -> accepted order. */
async function orderAtTournon(patient = 'alice', items = [{ medicineId: DOLIPRANE, quantity: 1 }], note?: string) {
  const id = await newRequest(patient, items, note);
  expect((await choose(patient, id, TOURNON)).status).toBe(200);
  const a = await accept('tournon', id);
  expect(a.status, JSON.stringify(a.body)).toBe(200);
  return { requestId: id, orderId: a.body.orderId as string };
}

describe('free choice of pharmacy', () => {
  it('proposes only eligible pharmacies with stock, and nothing reaches a pharmacy until the patient chooses', async () => {
    const id = await newRequest('alice', [{ medicineId: DOLIPRANE, quantity: 1 }]);
    const opts = await api()
      .get(`/api/patient/requests/${id}/options`)
      .set(auth(await tokenOf('alice')));
    expect(opts.status).toBe(200);
    expect(opts.body.canChoose).toBe(true);
    const names = opts.body.full.map((p: { name: string }) => p.name);
    expect(names[0]).toBe('Pharmacie du Rhône');
    expect(names).not.toContain('Pharmacie Démo'); // pending
    expect(names).not.toContain('Pharmacie de l’Étoile'); // 0 in stock

    const before = await api()
      .get('/api/pharmacy/incoming')
      .set(auth(await tokenOf('pharmacie.tournon')));
    expect(before.body.items.map((r: { id: string }) => r.id)).not.toContain(id);

    expect((await choose('alice', id, TOURNON)).body.status).toBe('sent_to_pharmacy');
    const tournon = await api()
      .get('/api/pharmacy/incoming')
      .set(auth(await tokenOf('pharmacie.tournon')));
    const mine = tournon.body.items.find((r: { id: string }) => r.id === id);
    expect(mine.patientName).toBe('Alice M.');
    expect(JSON.stringify(mine)).not.toMatch(/Moreau|Gabriel|alice@/);
    const valence = await api()
      .get('/api/pharmacy/incoming')
      .set(auth(await tokenOf('pharmacie.valence')));
    expect(valence.body.items.map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it('accept creates the order, decreases stock and writes the first history row', async () => {
    const before = (await stock(TOURNON, DOLIPRANE))!;
    const { orderId } = await orderAtTournon('alice', [{ medicineId: DOLIPRANE, quantity: 2 }]);
    expect(await stock(TOURNON, DOLIPRANE)).toBe(before - 2);
    const o = await api()
      .get(`/api/patient/orders/${orderId}`)
      .set(auth(await tokenOf('alice')));
    expect(o.body.order.status).toBe('accepted');
    expect(o.body.order.history.map((h: { status: string }) => h.status)).toEqual(['accepted']);
  });

  it('cannot choose an ineligible pharmacy', async () => {
    const id = await newRequest('alice', [{ medicineId: ZYRTEC, quantity: 1 }]);
    const res = await choose('alice', id, userId.pharmacy('demo'));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('pharmacy_unavailable');
  });

  it('is idempotent for the same request within 2 minutes', async () => {
    const token = await tokenOf('emma');
    const body = { items: [{ medicineId: ADVIL, quantity: 1 }] };
    const a = await api().post('/api/patient/requests').set(auth(token)).send(body);
    const b = await api().post('/api/patient/requests').set(auth(token)).send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body).toEqual({ id: a.body.id, duplicate: true });
  });
});

describe('prescription rule', () => {
  it('refuses a prescription medicine without the prescription statement', async () => {
    const res = await api()
      .post('/api/patient/requests')
      .set(auth(await tokenOf('bruno')))
      .send({ items: [{ medicineId: AMOXICILLINE, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('prescription_required');
  });

  it('accepts it with the statement, and the pharmacy must confirm the prescription before preparing', async () => {
    const { orderId } = await orderAtTournon(
      'bruno',
      [{ medicineId: AMOXICILLINE, quantity: 1 }],
      'I will show my prescription at the pharmacy.',
    );
    const noCheck = await move('tournon', orderId, 'preparing');
    expect(noCheck.status).toBe(400);
    expect(noCheck.body.code).toBe('prescription_check_required');
    expect((await move('tournon', orderId, 'preparing', true)).status).toBe(200);
  });

  it('accepts it without a note when a confirmed doctor creates the request', async () => {
    const res = await api()
      .post('/api/doctor/requests')
      .set(auth(await tokenOf('dr.martin')))
      .send({ patientId: userId.patient('alice'), items: [{ medicineId: AMOXICILLINE, quantity: 1 }], instructions: '1 matin et soir' });
    expect(res.status).toBe(201);
  });
});

describe('concurrency: exactly one pharmacy wins', () => {
  it('two pharmacies accepting at the same moment: one 200, one 409, one order', async () => {
    const id = await newRequest('camille', [{ medicineId: DOLIPRANE, quantity: 1 }]);
    expect((await choose('camille', id, TOURNON)).status).toBe(200);
    // Simulate a race where a second pharmacy also holds a pending turn for this request.
    await setStock(VALENCE, DOLIPRANE, 10);
    await pool.query(`INSERT INTO request_pharmacies (request_id, pharmacy_id) VALUES ($1,$2)`, [id, VALENCE]);
    const [a, b] = await Promise.all([accept('tournon', id), accept('valence', id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const orders = await pool.query('SELECT count(*)::int AS n FROM orders WHERE request_id = $1', [id]);
    expect(orders.rows[0].n).toBe(1);
  });

  it('a double click on accept creates only one order', async () => {
    const id = await newRequest('camille', [{ medicineId: ZYRTEC, quantity: 1 }]);
    await choose('camille', id, TOURNON);
    const results = await Promise.all([accept('tournon', id), accept('tournon', id), accept('tournon', id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('stock never goes below zero when two requests compete for the last box', async () => {
    await setStock(ROMANS, ADVIL, 1);
    const r1 = await newRequest('david', [{ medicineId: ADVIL, quantity: 1 }]);
    const r2 = await newRequest('emma', [{ medicineId: ADVIL, quantity: 1 }]);
    expect((await choose('david', r1, ROMANS)).status).toBe(200);
    expect((await choose('emma', r2, ROMANS)).status).toBe(200);
    const [a, b] = await Promise.all([accept('romans', r1), accept('romans', r2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.body.code, b.body.code]).toContain('insufficient_stock');
    expect(await stock(ROMANS, ADVIL)).toBe(0);
  });

  it('rejects a negative stock edit with a clear 400', async () => {
    const res = await api()
      .put(`/api/pharmacy/inventory/${ADVIL}`)
      .set(auth(await tokenOf('pharmacie.tournon')))
      .send({ quantity: -1, priceEur: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity: cannot be negative/);
  });
});

describe('refusal and expiry return the request to the patient', () => {
  it('a refusal sends it back; the refusing pharmacy is excluded', async () => {
    const id = await newRequest('alice', [{ medicineId: DOLIPRANE, quantity: 1 }]);
    await choose('alice', id, TOURNON);
    const refuse = await api()
      .post(`/api/pharmacy/requests/${id}/refuse`)
      .set(auth(await tokenOf('pharmacie.tournon')))
      .send({ reason: 'Fermeture exceptionnelle' });
    expect(refuse.status).toBe(200);
    const opts = await api()
      .get(`/api/patient/requests/${id}/options`)
      .set(auth(await tokenOf('alice')));
    expect(opts.body.status).toBe('received');
    expect(opts.body.full.map((p: { id: string }) => p.id)).not.toContain(TOURNON);
    const again = await choose('alice', id, TOURNON);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_declined');
    expect((await choose('alice', id, VALENCE)).status).toBe(200);
    // Tournon can no longer accept it.
    expect((await accept('tournon', id)).status).toBe(409);
  });

  it('no answer within 30 minutes: back to the patient; after 24 hours: expired', async () => {
    const id = await newRequest('emma', [{ medicineId: ZYRTEC, quantity: 1 }]);
    await choose('emma', id, TOURNON);
    await pool.query(`UPDATE request_pharmacies SET sent_at = now() - interval '31 minutes' WHERE request_id = $1`, [id]);
    await runExpiryJob();
    const r = await pool.query('SELECT status FROM requests WHERE id = $1', [id]);
    expect(r.rows[0].status).toBe('received');

    await pool.query(`UPDATE requests SET created_at = now() - interval '25 hours' WHERE id = $1`, [id]);
    await runExpiryJob();
    const r2 = await pool.query('SELECT status FROM requests WHERE id = $1', [id]);
    expect(r2.rows[0].status).toBe('expired');
  });
});

describe('doctor access is limited to confirmed patients', () => {
  const create = async (patient: string) =>
    api()
      .post('/api/doctor/requests')
      .set(auth(await tokenOf('dr.martin')))
      .send({ patientId: userId.patient(patient), items: [{ medicineId: ZYRTEC, quantity: 1 }] });

  it('creates for Alice and Bruno, refuses Camille (unconfirmed) and David (not linked)', async () => {
    expect((await create('alice')).status).toBe(201);
    expect((await create('bruno')).status).toBe(201);
    expect((await create('camille')).status).toBe(403);
    expect((await create('david')).status).toBe(403);
  });

  it('never shows addresses, and shows no details for unconfirmed links', async () => {
    const res = await api()
      .get('/api/doctor/patients')
      .set(auth(await tokenOf('dr.martin')));
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/"address"|latitude|Rue Gabriel|Madier de Montjau/);
    const camille = res.body.items.find((p: { confirmed: boolean }) => !p.confirmed);
    expect(camille.firstName).toBeNull();
    expect(camille.email).toMatch(/^c\*\*\*@/);
  });

  it("a doctor request does not reach a pharmacy until the patient chooses, and the patient can't be bypassed", async () => {
    const res = await create('bruno');
    const id = res.body.id;
    const r = await pool.query('SELECT count(*)::int AS n FROM request_pharmacies WHERE request_id = $1', [id]);
    expect(r.rows[0].n).toBe(0);
    // The doctor cannot choose a pharmacy (patient-only route).
    const doc = await api()
      .post(`/api/patient/requests/${id}/choose`)
      .set(auth(await tokenOf('dr.martin')))
      .send({ pharmacyId: TOURNON });
    expect(doc.status).toBe(403);
  });

  it('link requests answer the same whether or not the email exists', async () => {
    const t = await tokenOf('dr.martin');
    const a = await api().post('/api/doctor/links').set(auth(t)).send({ email: 'david@pharmacie.test' });
    const b = await api().post('/api/doctor/links').set(auth(t)).send({ email: 'nobody@pharmacie.test' });
    expect(a.status).toBe(202);
    expect(a.body).toEqual(b.body);
    // David must confirm before the doctor can create requests for him.
    expect((await create('david')).status).toBe(403);
    const confirm = await api()
      .post(`/api/patient/doctors/${userId.doctor('dr.martin')}/confirm`)
      .set(auth(await tokenOf('david')));
    expect(confirm.status).toBe(200);
    expect((await create('david')).status).toBe(201);
  });
});

describe('order status machine', () => {
  it('rejects invalid jumps and moves forward step by step', async () => {
    const { orderId } = await orderAtTournon('alice', [{ medicineId: PARACETAMOL_GENERIC, quantity: 1 }]);
    expect((await move('tournon', orderId, 'ready')).status).toBe(409);
    expect((await move('tournon', orderId, 'delivered')).status).toBe(409);
    for (const s of ['preparing', 'ready', 'out_for_delivery', 'delivered']) {
      const r = await move('tournon', orderId, s);
      expect(r.status, `${s}: ${JSON.stringify(r.body)}`).toBe(200);
    }
    const back = await move('tournon', orderId, 'preparing');
    expect(back.status).toBe(409);
    expect(back.body.error).toMatch(/cannot go from "delivered" to "preparing"/);
    expect((await move('tournon', orderId, 'cancelled')).status).toBe(409);
    const hist = await pool.query('SELECT status FROM order_status_history WHERE order_id = $1 ORDER BY id', [orderId]);
    expect(hist.rows.map((h) => h.status)).toEqual(['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered']);
  });

  it('only the owning pharmacy can move an order', async () => {
    const { orderId } = await orderAtTournon('alice', [{ medicineId: ADVIL, quantity: 1 }]);
    expect((await move('valence', orderId, 'preparing')).status).toBe(404);
  });

  it('cancelling returns the reserved stock', async () => {
    const before = (await stock(TOURNON, ZYRTEC))!;
    const { orderId } = await orderAtTournon('bruno', [{ medicineId: ZYRTEC, quantity: 3 }]);
    expect(await stock(TOURNON, ZYRTEC)).toBe(before - 3);
    const res = await api()
      .post(`/api/patient/orders/${orderId}/cancel`)
      .set(auth(await tokenOf('bruno')));
    expect(res.body).toMatchObject({ status: 'cancelled', cancellationRequested: false });
    expect(await stock(TOURNON, ZYRTEC)).toBe(before);
  });

  it('after "preparing" the patient can only ask; the pharmacy approves and the stock comes back', async () => {
    const before = (await stock(TOURNON, DOLIPRANE))!;
    const { orderId } = await orderAtTournon('camille', [{ medicineId: DOLIPRANE, quantity: 1 }]);
    await move('tournon', orderId, 'preparing');
    const ask = await api()
      .post(`/api/patient/orders/${orderId}/cancel`)
      .set(auth(await tokenOf('camille')));
    expect(ask.body).toMatchObject({ status: 'preparing', cancellationRequested: true });
    expect(await stock(TOURNON, DOLIPRANE)).toBe(before - 1);
    const ok = await api()
      .post(`/api/pharmacy/orders/${orderId}/cancellation`)
      .set(auth(await tokenOf('pharmacie.tournon')))
      .send({ approve: true });
    expect(ok.body.status).toBe('cancelled');
    expect(await stock(TOURNON, DOLIPRANE)).toBe(before);
  });
});

describe('partial stock and substitution', () => {
  it('a partially stocked pharmacy needs explicit confirmation; missing items are excluded', async () => {
    await setStock(VALENCE, ZYRTEC, 5);
    await setStock(VALENCE, ADVIL, 0);
    const id = await newRequest('bruno', [
      { medicineId: ZYRTEC, quantity: 1 },
      { medicineId: ADVIL, quantity: 1 },
    ]);
    const opts = await api()
      .get(`/api/patient/requests/${id}/options`)
      .set(auth(await tokenOf('bruno')));
    const valence = opts.body.partial.find((p: { id: string }) => p.id === VALENCE);
    expect(valence.missing.map((m: { medicineId: string }) => m.medicineId)).toEqual([ADVIL]);
    const plain = await choose('bruno', id, VALENCE);
    expect(plain.status).toBe(409);
    expect(plain.body.code).toBe('partial_requires_confirmation');
    expect((await choose('bruno', id, VALENCE, true)).status).toBe(200);
    expect((await accept('valence', id)).status).toBe(200);
    expect(await stock(VALENCE, ZYRTEC)).toBe(4);
    expect(await stock(VALENCE, ADVIL)).toBe(0);
  });

  it('the pharmacy proposes a generic, the patient approves, then the order continues', async () => {
    const id = await newRequest('emma', [{ medicineId: DOLIPRANE, quantity: 1 }]);
    await choose('emma', id, TOURNON);
    const item = await pool.query('SELECT id FROM request_items WHERE request_id = $1', [id]);
    const prop = await api()
      .post(`/api/pharmacy/requests/${id}/substitutions`)
      .set(auth(await tokenOf('pharmacie.tournon')))
      .send({ itemId: item.rows[0].id, proposedMedicineId: PARACETAMOL_GENERIC });
    expect(prop.status).toBe(201);
    expect((await accept('tournon', id)).status).toBe(409); // waiting for the patient
    const ok = await api()
      .post(`/api/patient/requests/${id}/substitutions/${prop.body.substitutionId}`)
      .set(auth(await tokenOf('emma')))
      .send({ approve: true });
    expect(ok.body).toMatchObject({ status: 'sent_to_pharmacy', approved: true });
    expect((await accept('tournon', id)).status).toBe(200);
    const med = await pool.query('SELECT medicine_id FROM request_items WHERE request_id = $1', [id]);
    expect(med.rows[0].medicine_id).toBe(PARACETAMOL_GENERIC);
  });

  it('refuses a "generic" with a different substance', async () => {
    const id = await newRequest('david', [{ medicineId: DOLIPRANE, quantity: 1 }]);
    await choose('david', id, TOURNON);
    const item = await pool.query('SELECT id FROM request_items WHERE request_id = $1', [id]);
    const res = await api()
      .post(`/api/pharmacy/requests/${id}/substitutions`)
      .set(auth(await tokenOf('pharmacie.tournon')))
      .send({ itemId: item.rows[0].id, proposedMedicineId: ADVIL });
    expect(res.status).toBe(400);
  });
});

describe('privacy and share link', () => {
  it('a patient cannot read another patient’s request or order', async () => {
    const { requestId, orderId } = await orderAtTournon('alice', [{ medicineId: ZYRTEC, quantity: 1 }]);
    const t = await tokenOf('bruno');
    expect((await api().get(`/api/patient/requests/${requestId}`).set(auth(t))).status).toBe(404);
    expect((await api().get(`/api/patient/orders/${orderId}`).set(auth(t))).status).toBe(404);
  });

  it('the share link shows status without personal data and expires after delivery', async () => {
    const { orderId } = await orderAtTournon('alice', [{ medicineId: ZYRTEC, quantity: 1 }]);
    const o = await api()
      .get(`/api/patient/orders/${orderId}`)
      .set(auth(await tokenOf('alice')));
    const token = o.body.order.shareToken;
    const shared = await api().get(`/api/share/${token}`);
    expect(shared.status).toBe(200);
    expect(shared.body.order.status).toBe('accepted');
    expect(JSON.stringify(shared.body)).not.toMatch(/Alice|Moreau|Zyrtec|address/i);
    for (const s of ['preparing', 'ready', 'out_for_delivery', 'delivered']) await move('tournon', orderId, s);
    expect((await api().get(`/api/share/${token}`)).status).toBe(200);
    await pool.query(`UPDATE orders SET updated_at = now() - interval '3 hours' WHERE id = $1`, [orderId]);
    expect((await api().get(`/api/share/${token}`)).status).toBe(410);
  });

  it('notifications have neutral email subjects and an unread count', async () => {
    const res = await api()
      .get('/api/notifications')
      .set(auth(await tokenOf('alice')));
    expect(res.status).toBe(200);
    expect(res.body.unread).toBeGreaterThan(0);
    const { sentMails } = await import('../src/notify.js');
    expect(sentMails.length).toBeGreaterThan(0);
    for (const m of sentMails) expect(m.subject).not.toMatch(/doliprane|zyrtec|amoxicilline|advil|paracétamol/i);
  });
});
