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
import { getProfile } from '../services/profile.js';
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

addRoutes([
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
  ['post', '/api/patient/orders/:id/cancel', 'Patient', 'Cancel (accepted) or ask to cancel (later)', 'bearer'],
  ['get', '/api/patient/doctors', 'Patient', 'My doctor links', 'bearer'],
  ['post', '/api/patient/doctors/:doctorId/confirm', 'Patient', 'Confirm a doctor link', 'bearer'],
  ['delete', '/api/patient/doctors/:doctorId', 'Patient', 'Remove a doctor link', 'bearer'],
  ['patch', '/api/patient/profile', 'Patient', 'Update phone / address / location', 'bearer'],
  ['get', '/api/patient/export', 'Patient', 'Export my data (JSON)', 'bearer'],
  ['delete', '/api/patient/account', 'Patient', 'Delete my account (anonymised, orders kept)', 'bearer'],
]);
