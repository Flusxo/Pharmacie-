import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, pool, query, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { notify } from '../notify.js';
import { addRoutes } from '../openapi.js';
import { cancelOrderByPatient, getPatientOrder, listPatientOrders } from '../services/orders.js';
import { getPayment, getReceipt, startPayment } from '../services/payments.js';
import { getProfile } from '../services/profile.js';
import { followMedicine, listFollowed, unfollowMedicine } from '../services/watches.js';
import {
  chooseSlot,
  createReview,
  getOwnReview,
  listMessages,
  postMessage,
  reportMessage,
  slotsForOrder,
} from '../services/conversations.js';
import { messageLimiter } from './files.js';
import { cleanFilename, deleteOwnFile, listPrescriptionFiles, readBody, savePrescription } from '../services/files.js';
import { rawUpload } from './files.js';
import {
  cancelRequest,
  choosePharmacy,
  createRequest,
  decideSubstitution,
  getOptions,
  getPatientRequest,
  listPatientRequests,
} from '../services/requests.js';
import { idParam, latitude, longitude, uuid } from '../validate.js';

export const patientRouter = Router();
patientRouter.use(requireRole('patient'));

export const itemsSchema = z
  .array(z.object({ medicineId: uuid, quantity: z.number().int().min(1, 'must be at least 1').max(10, 'must be at most 10') }))
  .min(1, 'add at least one medicine')
  .max(20, 'at most 20 different medicines');

patientRouter.post('/requests', async (req, res) => {
  const body = z.object({ items: itemsSchema, prescriptionNote: z.string().trim().max(500).optional().nullable() }).parse(req.body);
  const r = await createRequest({ patientId: req.user!.id, items: body.items, prescriptionNote: body.prescriptionNote });
  res.status(r.duplicate ? 200 : 201).json(r);
});

patientRouter.get('/requests', async (req, res) => {
  res.json({ items: await listPatientRequests(req.user!.id) });
});

patientRouter.get('/requests/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ request: await getPatientRequest(id, req.user!.id) });
});

patientRouter.get('/requests/:id/options', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const q = z
    .object({ lat: latitude.optional(), lon: longitude.optional(), radiusKm: z.coerce.number().min(1).max(200).default(50) })
    .parse(req.query);
  res.json(await getOptions(id, req.user!.id, q));
});

patientRouter.post('/requests/:id/choose', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = z.object({ pharmacyId: uuid, acceptPartial: z.boolean().default(false) }).parse(req.body);
  res.json(await choosePharmacy(id, req.user!.id, body.pharmacyId, body.acceptPartial));
});

patientRouter.post('/requests/:id/cancel', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await cancelRequest(id, req.user!.id));
});

patientRouter.post('/requests/:id/substitutions/:substitutionId', async (req, res) => {
  const p = z.object({ id: uuid, substitutionId: uuid }).parse(req.params);
  const body = z.object({ approve: z.boolean() }).parse(req.body);
  res.json(await decideSubstitution(p.id, req.user!.id, p.substitutionId, body.approve));
});

patientRouter.get('/orders', async (req, res) => {
  res.json({ items: await listPatientOrders(req.user!.id) });
});

patientRouter.get('/orders/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ order: await getPatientOrder(id, req.user!.id) });
});

// Payment (Stripe test mode): only for an accepted order, on Stripe's own page; the amount is computed on the server.
patientRouter.post('/orders/:id/pay', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await startPayment(id, req.user!.id));
});

patientRouter.get('/orders/:id/payment', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getPayment(id, { patientId: req.user!.id }));
});

patientRouter.get('/orders/:id/receipt', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getReceipt(id, req.user!.id));
});

patientRouter.post('/orders/:id/cancel', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await cancelOrderByPatient(id, req.user!.id));
});

// Doctor links
patientRouter.get('/doctors', async (req, res) => {
  const rows = await query(
    `SELECT d.user_id AS id, d.first_name AS "firstName", d.last_name AS "lastName", d.speciality, dp.confirmed, dp.created_at AS "createdAt"
       FROM doctor_patients dp JOIN doctors d ON d.user_id = dp.doctor_id
      WHERE dp.patient_id = $1 ORDER BY dp.confirmed, dp.created_at DESC`,
    [req.user!.id],
  );
  res.json({ items: rows });
});

const doctorParam = z.object({ doctorId: uuid });

patientRouter.post('/doctors/:doctorId/confirm', async (req, res) => {
  const { doctorId } = doctorParam.parse(req.params);
  const r = await pool.query(
    'UPDATE doctor_patients SET confirmed = true WHERE doctor_id = $1 AND patient_id = $2 AND NOT confirmed RETURNING doctor_id',
    [doctorId, req.user!.id],
  );
  if (!r.rowCount) throw notFound('No link request from this doctor.');
  const p = await one<{ first_name: string; last_name: string }>('SELECT first_name, last_name FROM patients WHERE user_id = $1', [
    req.user!.id,
  ]);
  await notify(doctorId, 'doctor_link', `${p?.first_name} ${p?.last_name.charAt(0)}. confirmed the link.`, '/doctor');
  res.json({ confirmed: true });
});

patientRouter.delete('/doctors/:doctorId', async (req, res) => {
  const { doctorId } = doctorParam.parse(req.params);
  const r = await pool.query('DELETE FROM doctor_patients WHERE doctor_id = $1 AND patient_id = $2', [doctorId, req.user!.id]);
  if (!r.rowCount) throw notFound('No link with this doctor.');
  res.json({ removed: true });
});

patientRouter.patch('/profile', async (req, res) => {
  const body = z
    .object({
      phone: z.string().trim().max(30).nullable().optional(),
      address: z.string().trim().max(200).nullable().optional(),
      latitude: latitude.nullable().optional(),
      longitude: longitude.nullable().optional(),
    })
    .parse(req.body);
  const fields = Object.entries(body).filter(([, v]) => v !== undefined);
  if (fields.length) {
    const cols: Record<string, string> = { phone: 'phone', address: 'address', latitude: 'latitude', longitude: 'longitude' };
    const sets = fields.map(([k], i) => `${cols[k]} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE patients SET ${sets} WHERE user_id = $1`, [req.user!.id, ...fields.map(([, v]) => v)]);
  }
  res.json({ user: await getProfile(req.user!.id) });
});

/** GDPR-style export of the patient's own data. */
patientRouter.get('/export', async (req, res) => {
  const id = req.user!.id;
  const data = {
    exportedAt: new Date().toISOString(),
    notice: 'Prototype only. Not for real medical use. Demo data.',
    profile: await getProfile(id),
    requests: await listPatientRequests(id),
    orders: await listPatientOrders(id),
    doctorLinks: await query(
      `SELECT d.first_name || ' ' || d.last_name AS doctor, dp.confirmed, dp.created_at AS "createdAt"
         FROM doctor_patients dp JOIN doctors d ON d.user_id = dp.doctor_id WHERE dp.patient_id = $1`,
      [id],
    ),
    followedMedicines: await listFollowed(id),
    notifications: await query('SELECT kind, body, read_at AS "readAt", created_at AS "createdAt" FROM notifications WHERE user_id = $1', [
      id,
    ]),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="counter-my-data.json"');
  res.json(data);
});

/** Deletes the account: personal fields anonymised, orders kept without personal data. */
patientRouter.delete('/account', async (req, res) => {
  const { password } = z.object({ password: z.string().min(1, 'is required') }).parse(req.body);
  const id = req.user!.id;
  const u = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [id]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw badRequest('Your password is not correct.');
  const active = await one(`SELECT 1 FROM orders WHERE patient_id = $1 AND status NOT IN ('delivered', 'cancelled') LIMIT 1`, [id]);
  if (active) throw conflict('You have an order in progress. Wait until it is delivered or cancelled before deleting your account.');
  await tx(async (c) => {
    await c.query(
      `UPDATE requests SET status = 'cancelled', updated_at = now() WHERE patient_id = $1 AND status IN ('received', 'sent_to_pharmacy', 'awaiting_patient_approval')`,
      [id],
    );
    await c.query(
      `UPDATE request_pharmacies rp SET response = 'expired' FROM requests r WHERE r.id = rp.request_id AND r.patient_id = $1 AND rp.response = 'pending'`,
      [id],
    );
    await c.query('DELETE FROM doctor_patients WHERE patient_id = $1', [id]);
    await c.query('DELETE FROM notifications WHERE user_id = $1', [id]);
    await c.query('DELETE FROM stock_watches WHERE patient_id = $1', [id]);
    await c.query('DELETE FROM private_files WHERE owner_user_id = $1', [id]);
    await c.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    await c.query(
      `UPDATE patients SET first_name = 'Deleted', last_name = 'user', birth_date = NULL, phone = NULL, address = NULL, latitude = NULL, longitude = NULL WHERE user_id = $1`,
      [id],
    );
    await c.query(
      `UPDATE users SET email = $2, password_hash = $3, status = 'suspended', deleted_at = now(), email_notifications = false WHERE id = $1`,
      [id, `deleted-${id}@deleted.invalid`, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)],
    );
    await c.query(`UPDATE orders SET share_token = NULL WHERE patient_id = $1`, [id]);
  });
  res.json({ deleted: true });
});

// Prescription photo or PDF on one of my requests (kept privately; only the pharmacy I chose can open it)
patientRouter.get('/requests/:id/files', async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await one('SELECT 1 FROM requests WHERE id = $1 AND patient_id = $2', [id, req.user!.id]))) throw notFound('Request not found.');
  res.json({ items: await listPrescriptionFiles(id) });
});
patientRouter.post('/requests/:id/files', rawUpload, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { buf, type } = readBody(req.body, req.headers['content-type']);
  const meta = await savePrescription(req.user!.id, id, cleanFilename(req.header('x-filename'), type), buf, type);
  res.status(201).json(meta);
});
patientRouter.delete('/files/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  await deleteOwnFile(id, req.user!.id, 'prescription');
  res.status(204).end();
});

// Messages on an order (text only; no medical advice: the pharmacist answers at the counter or by phone)
const messageBody = z.object({ body: z.string().trim().min(1, 'is empty').max(500, 'is too long (500 characters at most)') });
patientRouter.get('/orders/:id/messages', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ items: await listMessages(id, 'patient', req.user!.id) });
});
patientRouter.post('/orders/:id/messages', messageLimiter, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { body } = messageBody.parse(req.body);
  res.status(201).json(await postMessage(id, 'patient', req.user!.id, req.user!.id, body));
});
patientRouter.post('/messages/:id/report', async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  await reportMessage(id, 'patient', req.user!.id, req.user!.id, reason);
  res.status(201).json({ ok: true });
});

// Review of a delivered order, and the time chosen for pickup or (simulated) delivery
patientRouter.get('/orders/:id/review', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ review: await getOwnReview(id, req.user!.id) });
});
patientRouter.post('/orders/:id/review', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const b = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(300).optional().nullable() }).parse(req.body);
  res.status(201).json(await createReview(id, req.user!.id, b.rating, b.comment || null));
});
patientRouter.get('/orders/:id/slots', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await slotsForOrder(id, req.user!.id));
});
patientRouter.put('/orders/:id/slot', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const b = z.object({ start: z.string().datetime(), mode: z.enum(['pickup', 'delivery']) }).parse(req.body);
  await chooseSlot(id, req.user!.id, b.start, b.mode);
  res.json({ ok: true });
});

// "Notify me when it is back in stock"
patientRouter.get('/watches', async (req, res) => {
  res.json({ items: await listFollowed(req.user!.id) });
});
patientRouter.post('/watches', async (req, res) => {
  const { medicineId } = z.object({ medicineId: uuid }).parse(req.body);
  await followMedicine(req.user!.id, medicineId);
  res.status(201).json({ ok: true });
});
patientRouter.delete('/watches/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  await unfollowMedicine(req.user!.id, id);
  res.status(204).end();
});

addRoutes([
  ['get', '/api/patient/requests/:id/files', 'Patient', 'Prescription files attached to my request', 'bearer'],
  [
    'post',
    '/api/patient/requests/:id/files',
    'Patient',
    'Attach a prescription (raw JPEG, PNG, WebP or PDF, at most 2 MB, 3 per request; X-Filename header)',
    'bearer',
  ],
  ['delete', '/api/patient/files/:id', 'Patient', 'Remove one of my prescription files', 'bearer'],
  ['get', '/api/patient/orders/:id/messages', 'Patient', 'Messages of my order', 'bearer'],
  ['post', '/api/patient/orders/:id/messages', 'Patient', 'Send a message about my order (text, 500 characters, rate limited)', 'bearer'],
  ['post', '/api/patient/messages/:id/report', 'Patient', 'Report a message', 'bearer'],
  ['get', '/api/patient/orders/:id/review', 'Patient', 'My review of this order', 'bearer'],
  ['post', '/api/patient/orders/:id/review', 'Patient', 'Review a delivered order (1-5 and a short comment)', 'bearer'],
  ['get', '/api/patient/orders/:id/slots', 'Patient', 'Free 30-minute times in the pharmacy opening hours (next 48 hours)', 'bearer'],
  ['put', '/api/patient/orders/:id/slot', 'Patient', 'Choose a pickup or (simulated) delivery time', 'bearer'],
  ['get', '/api/patient/watches', 'Patient', 'Medicines I follow for a back-in-stock notice', 'bearer'],
  ['post', '/api/patient/watches', 'Patient', 'Follow a medicine: one notice when a nearby pharmacy has it again', 'bearer'],
  ['delete', '/api/patient/watches/:id', 'Patient', 'Stop following a medicine (id = medicine id)', 'bearer'],
  [
    'post',
    '/api/patient/requests',
    'Patient',
    'Create a request (idempotent for 2 minutes; prescription items need prescriptionNote)',
    'bearer',
  ],
  ['get', '/api/patient/requests', 'Patient', 'List my requests', 'bearer'],
  ['get', '/api/patient/requests/:id', 'Patient', 'Request details', 'bearer'],
  ['get', '/api/patient/requests/:id/options', 'Patient', 'Pharmacies I can choose (full + partially available)', 'bearer'],
  ['post', '/api/patient/requests/:id/choose', 'Patient', 'Choose a pharmacy (acceptPartial for partial stock)', 'bearer'],
  ['post', '/api/patient/requests/:id/cancel', 'Patient', 'Cancel a request without order', 'bearer'],
  ['post', '/api/patient/requests/:id/substitutions/:substitutionId', 'Patient', 'Approve or decline a proposed generic', 'bearer'],
  ['get', '/api/patient/orders', 'Patient', 'List my orders', 'bearer'],
  ['get', '/api/patient/orders/:id', 'Patient', 'Order details with history', 'bearer'],
  ['post', '/api/patient/orders/:id/pay', 'Patient', 'Start the Stripe test payment (hosted page, authorisation only)', 'bearer'],
  ['get', '/api/patient/orders/:id/payment', 'Patient', 'Payment status of an order', 'bearer'],
  ['get', '/api/patient/orders/:id/receipt', 'Patient', 'Receipt of a paid order', 'bearer'],
  ['post', '/api/patient/orders/:id/cancel', 'Patient', 'Cancel (accepted) or ask to cancel (later)', 'bearer'],
  ['get', '/api/patient/doctors', 'Patient', 'My doctor links', 'bearer'],
  ['post', '/api/patient/doctors/:doctorId/confirm', 'Patient', 'Confirm a doctor link', 'bearer'],
  ['delete', '/api/patient/doctors/:doctorId', 'Patient', 'Remove a doctor link', 'bearer'],
  ['patch', '/api/patient/profile', 'Patient', 'Update phone / address / location', 'bearer'],
  ['get', '/api/patient/export', 'Patient', 'Export my data (JSON)', 'bearer'],
  ['delete', '/api/patient/account', 'Patient', 'Delete my account (anonymised, orders kept)', 'bearer'],
]);
