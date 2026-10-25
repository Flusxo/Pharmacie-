import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { maskEmail } from '../logger.js';
import { requireRole } from '../middleware/auth.js';
import { notify } from '../notify.js';
import { addRoutes } from '../openapi.js';
import { createRequest } from '../services/requests.js';
import { emailField, idParam, uuid } from '../validate.js';
import { itemsSchema } from './patient.js';

export const doctorRouter = Router();
doctorRouter.use(requireRole('doctor'));

/**
 * Confirmed patients with name and birth date (never the address).
 * Pending links only show a masked email, because the patient has not agreed yet.
 */
doctorRouter.get('/patients', async (req, res) => {
  const rows = await query<{ confirmed: boolean; email: string }>(
    `SELECT dp.patient_id AS id, dp.confirmed, dp.created_at AS "createdAt",
            CASE WHEN dp.confirmed THEN p.first_name END AS "firstName",
            CASE WHEN dp.confirmed THEN p.last_name END AS "lastName",
            CASE WHEN dp.confirmed THEN to_char(p.birth_date, 'YYYY-MM-DD') END AS "birthDate",
            u.email
       FROM doctor_patients dp JOIN patients p ON p.user_id = dp.patient_id JOIN users u ON u.id = dp.patient_id
      WHERE dp.doctor_id = $1 AND u.deleted_at IS NULL
      ORDER BY dp.confirmed DESC, p.last_name`,
    [req.user!.id],
  );
  res.json({ items: rows.map((r) => ({ ...r, email: r.confirmed ? r.email : maskEmail(r.email) })) });
});

const LINK_MESSAGE = 'If this patient has an account, they will receive your link request and must confirm it.';

doctorRouter.post('/links', async (req, res) => {
  const { email } = z.object({ email: emailField }).parse(req.body);
  const p = await one<{ id: string }>(
    `SELECT u.id FROM users u JOIN patients p ON p.user_id = u.id WHERE u.email = $1 AND u.deleted_at IS NULL AND u.status = 'active'`,
    [email],
  );
  if (p) {
    const r = await pool.query('INSERT INTO doctor_patients (doctor_id, patient_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
      req.user!.id,
      p.id,
    ]);
    if (r.rowCount) {
      const d = await one<{ last_name: string }>('SELECT last_name FROM doctors WHERE user_id = $1', [req.user!.id]);
      await notify(
        p.id,
        'doctor_link',
        `Dr ${d?.last_name} would like to link to your account. Confirm only if you know this doctor.`,
        '/profile',
      );
    }
  }
  // Same answer whether or not the email exists (no account enumeration).
  res.status(202).json({ message: LINK_MESSAGE });
});

/** Reminder for a link the patient has not confirmed yet: one a day, and only to the patient who was asked. */
doctorRouter.post('/links/:patientId/remind', async (req, res) => {
  const { patientId } = z.object({ patientId: uuid }).parse(req.params);
  const link = await one<{ confirmed: boolean }>('SELECT confirmed FROM doctor_patients WHERE doctor_id = $1 AND patient_id = $2', [
    req.user!.id,
    patientId,
  ]);
  if (!link) throw notFound('No link with this patient.');
  if (link.confirmed) throw conflict('This patient has already confirmed the link.');
  const recent = await one(
    "SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'doctor_link' AND created_at > now() - interval '24 hours' LIMIT 1",
    [patientId],
  );
  if (recent) throw conflict('A reminder was already sent in the last 24 hours.', 'reminder_too_soon');
  const d = await one<{ last_name: string }>('SELECT last_name FROM doctors WHERE user_id = $1', [req.user!.id]);
  await notify(
    patientId,
    'doctor_link',
    `Reminder: Dr ${d?.last_name} is waiting for your confirmation. Confirm only if you know this doctor.`,
    '/profile',
  );
  res.json({ reminded: true });
});

doctorRouter.delete('/links/:patientId', async (req, res) => {
  const { patientId } = z.object({ patientId: uuid }).parse(req.params);
  const r = await pool.query('DELETE FROM doctor_patients WHERE doctor_id = $1 AND patient_id = $2', [req.user!.id, patientId]);
  if (!r.rowCount) throw notFound('No link with this patient.');
  res.json({ removed: true });
});

doctorRouter.post('/requests', async (req, res) => {
  const body = z
    .object({ patientId: uuid, items: itemsSchema, instructions: z.string().trim().max(1000).optional().nullable() })
    .parse(req.body);
  const r = await createRequest({ patientId: body.patientId, doctorId: req.user!.id, items: body.items, instructions: body.instructions });
  res.status(r.duplicate ? 200 : 201).json(r);
});

/** Requests this doctor created: status only; the chosen pharmacy is the patient's private choice. */
doctorRouter.get('/requests', async (req, res) => {
  const rows = await query(
    `SELECT r.id, r.status, r.instructions, r.created_at AS "createdAt", o.status AS "orderStatus",
            p.first_name || ' ' || p.last_name AS "patientName",
            (SELECT json_agg(json_build_object('name', m.name, 'dosage', m.dosage, 'quantity', ri.quantity) ORDER BY m.name)
               FROM request_items ri JOIN medicines m ON m.id = ri.medicine_id WHERE ri.request_id = r.id) AS items
       FROM requests r JOIN patients p ON p.user_id = r.patient_id LEFT JOIN orders o ON o.request_id = r.id
       JOIN doctor_patients dp ON dp.doctor_id = r.doctor_id AND dp.patient_id = r.patient_id AND dp.confirmed
      WHERE r.doctor_id = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [req.user!.id],
  );
  res.json({ items: rows });
});

doctorRouter.get('/templates', async (req, res) => {
  res.json({
    items: await query(
      `SELECT t.id, t.name, t.instructions, t.created_at AS "createdAt",
              (SELECT json_agg(json_build_object('medicineId', m.id, 'name', m.name, 'dosage', m.dosage, 'quantity', (x->>'quantity')::int))
                 FROM jsonb_array_elements(t.items) x JOIN medicines m ON m.id = (x->>'medicineId')::uuid) AS items
         FROM doctor_templates t WHERE t.doctor_id = $1 ORDER BY t.name`,
      [req.user!.id],
    ),
  });
});

doctorRouter.post('/templates', async (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(2).max(80), items: itemsSchema, instructions: z.string().trim().max(1000).optional().nullable() })
    .parse(req.body);
  const t = await one<{ id: string }>(
    'INSERT INTO doctor_templates (doctor_id, name, items, instructions) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.user!.id, body.name, JSON.stringify(body.items), body.instructions ?? null],
  );
  res.status(201).json({ id: t!.id });
});

doctorRouter.delete('/templates/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const r = await pool.query('DELETE FROM doctor_templates WHERE id = $1 AND doctor_id = $2', [id, req.user!.id]);
  if (!r.rowCount) throw notFound('Template not found.');
  res.json({ removed: true });
});

addRoutes([
  ['get', '/api/doctor/patients', 'Doctor', 'Linked patients (details only when confirmed; never the address)', 'bearer'],
  ['post', '/api/doctor/links', 'Doctor', 'Ask a patient (by email) to link; same answer whether or not the email exists', 'bearer'],
  ['post', '/api/doctor/links/:patientId/remind', 'Doctor', 'Remind a patient to confirm the link (once a day)', 'bearer'],
  ['delete', '/api/doctor/links/:patientId', 'Doctor', 'Remove a link', 'bearer'],
  ['post', '/api/doctor/requests', 'Doctor', 'Create a request for a confirmed patient (patient then chooses the pharmacy)', 'bearer'],
  ['get', '/api/doctor/requests', 'Doctor', 'Requests I created', 'bearer'],
  ['get', '/api/doctor/templates', 'Doctor', 'Request templates', 'bearer'],
  ['post', '/api/doctor/templates', 'Doctor', 'Create a template', 'bearer'],
  ['delete', '/api/doctor/templates/:id', 'Doctor', 'Delete a template', 'bearer'],
]);
