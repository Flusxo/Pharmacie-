/**
 * Staff back office. Every staff role can VIEW. Writes are limited by sub-role and always audited:
 *   verify / reject doctors & pharmacies  -> admin, moderator
 *   suspend / reactivate users            -> admin, moderator (only admin may touch staff accounts)
 *   medicines create / update / delete    -> admin, moderator
 *   resolve reports                       -> admin, support, moderator
 *   create staff                          -> admin
 * Staff can never act as another user (no impersonation endpoint exists).
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type pg from 'pg';
import { RULES } from '../config.js';
import { one, query, tx, type Db } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { requireStaff } from '../middleware/auth.js';
import { notify } from '../notify.js';
import { addRoutes } from '../openapi.js';
import { MEDICINE_COLUMNS } from '../services/search.js';
import { emailField, idParam, page, passwordField, reasonField } from '../validate.js';

export const adminRouter = Router();
adminRouter.use(requireStaff());

const canModerate = requireStaff('admin', 'moderator');
const adminOnly = requireStaff('admin');

async function audit(db: Db, actorId: string, action: string, target: string, reason: string | null): Promise<void> {
  await db.query('INSERT INTO audit_log (actor_user_id, action, target, reason) VALUES ($1,$2,$3,$4)', [actorId, action, target, reason]);
}

// ---------- Read ----------

adminRouter.get('/stats', async (_req, res) => {
  const s = await one(
    `SELECT
       (SELECT json_object_agg(role, n) FROM (SELECT role, count(*)::int n FROM users WHERE deleted_at IS NULL GROUP BY role) x) AS "usersByRole",
       (SELECT count(*) FROM doctors d JOIN users u ON u.id = d.user_id WHERE NOT d.verified AND u.deleted_at IS NULL)::int
         + (SELECT count(*) FROM pharmacies p JOIN users u ON u.id = p.user_id WHERE NOT p.verified AND u.deleted_at IS NULL)::int AS "pendingVerifications",
       (SELECT count(*) FROM requests WHERE (created_at AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date)::int AS "requestsToday",
       (SELECT coalesce(json_object_agg(status, n), '{}') FROM (SELECT status, count(*)::int n FROM orders GROUP BY status) x) AS "ordersByStatus",
       (SELECT count(*) FROM reports WHERE status = 'open')::int AS "openReports",
       (SELECT round(avg(extract(epoch FROM responded_at - sent_at) / 60)::numeric, 1)::float FROM request_pharmacies
         WHERE response IN ('accepted', 'refused') AND sent_at > now() - interval '7 days') AS "avgResponseMinutes7d"`,
  );
  res.json(s);
});

adminRouter.get('/users', async (req, res) => {
  const q = z
    .object({
      role: z.enum(['patient', 'doctor', 'pharmacy', 'staff']).optional(),
      status: z.enum(['pending', 'active', 'suspended']).optional(),
      q: z.string().trim().max(80).optional(),
      page,
    })
    .parse(req.query);
  const rows = await query<{ total: number }>(
    `SELECT u.id, u.email, u.role, u.status, u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
            coalesce(pt.first_name || ' ' || pt.last_name, 'Dr ' || d.first_name || ' ' || d.last_name, ph.name, s.full_name) AS name,
            s.staff_role AS "staffRole", coalesce(d.verified, ph.verified) AS verified,
            u.locked_until > now() AS locked, count(*) OVER ()::int AS total
       FROM users u
       LEFT JOIN patients pt ON pt.user_id = u.id LEFT JOIN doctors d ON d.user_id = u.id
       LEFT JOIN pharmacies ph ON ph.user_id = u.id LEFT JOIN staff s ON s.user_id = u.id
      WHERE u.deleted_at IS NULL AND ($1::user_role IS NULL OR u.role = $1) AND ($2::user_status IS NULL OR u.status = $2)
        AND ($3::text IS NULL OR f_norm(u.email || ' ' || coalesce(pt.first_name || ' ' || pt.last_name, d.first_name || ' ' || d.last_name, ph.name, s.full_name, ''))
             LIKE '%' || f_norm($3) || '%')
      ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`,
    [q.role ?? null, q.status ?? null, q.q || null, RULES.PAGE_SIZE, (q.page - 1) * RULES.PAGE_SIZE],
  );
  res.json({ items: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0, page: q.page, pageSize: RULES.PAGE_SIZE });
});

adminRouter.get('/verifications', async (_req, res) => {
  const doctors = await query(
    `SELECT d.user_id AS id, 'doctor' AS kind, 'Dr ' || d.first_name || ' ' || d.last_name AS name, d.rpps AS "registryNumber", d.speciality AS detail,
            u.email, u.created_at AS "createdAt", d.rejection_reason AS "rejectionReason"
       FROM doctors d JOIN users u ON u.id = d.user_id WHERE NOT d.verified AND u.deleted_at IS NULL ORDER BY u.created_at`,
  );
  const pharmacies = await query(
    `SELECT p.user_id AS id, 'pharmacy' AS kind, p.name, p.finess AS "registryNumber", p.address AS detail,
            u.email, u.created_at AS "createdAt", p.rejection_reason AS "rejectionReason"
       FROM pharmacies p JOIN users u ON u.id = p.user_id WHERE NOT p.verified AND u.deleted_at IS NULL ORDER BY u.created_at`,
  );
  res.json({ items: [...doctors, ...pharmacies] });
});

adminRouter.get('/pharmacies', async (_req, res) => {
  res.json({
    items: await query(
      `SELECT p.user_id AS id, p.name, p.city, p.address, p.finess, p.verified, p.paused, u.status, u.email,
              (SELECT count(*) FROM pharmacy_inventory i WHERE i.pharmacy_id = p.user_id AND i.quantity > 0)::int AS "inStockItems"
         FROM pharmacies p JOIN users u ON u.id = p.user_id WHERE u.deleted_at IS NULL ORDER BY p.name`,
    ),
  });
});

adminRouter.get('/doctors', async (_req, res) => {
  res.json({
    items: await query(
      `SELECT d.user_id AS id, d.first_name AS "firstName", d.last_name AS "lastName", d.rpps, d.speciality, d.verified, u.status, u.email,
              (SELECT count(*) FROM doctor_patients dp WHERE dp.doctor_id = d.user_id AND dp.confirmed)::int AS "confirmedPatients"
         FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.deleted_at IS NULL ORDER BY d.last_name`,
    ),
  });
});

adminRouter.get('/medicines', async (req, res) => {
  const q = z.object({ q: z.string().trim().max(80).optional(), includeDeleted: z.enum(['0', '1']).default('0') }).parse(req.query);
  res.json({
    items: await query(
      `SELECT ${MEDICINE_COLUMNS}, m.deleted_at AS "deletedAt" FROM medicines m
        WHERE ($1 OR m.deleted_at IS NULL) AND ($2::text IS NULL OR f_norm(m.name) LIKE '%' || f_norm($2) || '%' OR m.cip13 = $2)
        ORDER BY m.name`,
      [q.includeDeleted === '1', q.q || null],
    ),
  });
});

adminRouter.get('/orders', async (req, res) => {
  const q = z
    .object({ status: z.enum(['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled']).optional() })
    .parse(req.query);
  res.json({
    items: await query(
      `SELECT o.id, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.cancel_requested_at AS "cancelRequestedAt",
              p.name AS "pharmacyName", pt.first_name || ' ' || left(pt.last_name, 1) || '.' AS "patientName",
              (SELECT count(*) FROM request_items ri WHERE ri.request_id = o.request_id)::int AS "itemCount"
         FROM orders o JOIN pharmacies p ON p.user_id = o.pharmacy_id JOIN patients pt ON pt.user_id = o.patient_id
        WHERE ($1::order_status IS NULL OR o.status = $1) ORDER BY o.created_at DESC LIMIT 200`,
      [q.status ?? null],
    ),
  });
});

adminRouter.get('/reports', async (req, res) => {
  const q = z.object({ status: z.enum(['open', 'resolved']).optional() }).parse(req.query);
  res.json({
    items: await query(
      `SELECT r.id, r.subject, r.message, r.status, r.resolution, r.created_at AS "createdAt", u.role AS "reporterRole", u.email AS "reporterEmail"
         FROM reports r JOIN users u ON u.id = r.reporter_user_id WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.created_at DESC LIMIT 200`,
      [q.status ?? null],
    ),
  });
});

adminRouter.get('/audit', async (_req, res) => {
  res.json({
    items: await query(
      `SELECT a.id, a.action, a.target, a.reason, a.created_at AS "createdAt", s.full_name AS "actorName", s.staff_role AS "actorRole"
         FROM audit_log a LEFT JOIN staff s ON s.user_id = a.actor_user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 300`,
    ),
  });
});

adminRouter.get('/performance', async (_req, res) => {
  res.json({
    items: await query(
      `SELECT p.user_id AS id, p.name, p.city,
              count(rp.*)::int AS received,
              count(rp.*) FILTER (WHERE rp.response = 'accepted')::int AS accepted,
              count(rp.*) FILTER (WHERE rp.response = 'refused')::int AS refused,
              count(rp.*) FILTER (WHERE rp.response = 'expired')::int AS expired,
              CASE WHEN count(rp.*) FILTER (WHERE rp.response <> 'pending') = 0 THEN NULL
                   ELSE round(100.0 * count(rp.*) FILTER (WHERE rp.response = 'accepted') / count(rp.*) FILTER (WHERE rp.response <> 'pending'))::int END
                AS "acceptanceRate",
              round(avg(extract(epoch FROM rp.responded_at - rp.sent_at) / 60) FILTER (WHERE rp.response IN ('accepted', 'refused'))::numeric, 1)::float
                AS "avgResponseMinutes",
              (SELECT count(*) FROM orders o WHERE o.pharmacy_id = p.user_id AND o.status NOT IN ('delivered', 'cancelled'))::int AS "activeOrders"
         FROM pharmacies p LEFT JOIN request_pharmacies rp ON rp.pharmacy_id = p.user_id
        WHERE p.verified GROUP BY p.user_id, p.name, p.city ORDER BY p.name`,
    ),
  });
});

// ---------- Write (audited) ----------

const verifyParams = z.object({ kind: z.enum(['doctor', 'pharmacy']), id: z.uuid({ message: 'must be a valid identifier' }) });

adminRouter.post('/verify/:kind/:id', canModerate, async (req, res) => {
  const { kind, id } = verifyParams.parse(req.params);
  const body = z
    .object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() })
    .refine((b) => b.decision === 'approve' || (b.reason?.length ?? 0) >= 3, {
      message: 'a reason is required to reject',
      path: ['reason'],
    })
    .parse(req.body);
  const table = kind === 'doctor' ? 'doctors' : 'pharmacies';
  await tx(async (c) => {
    const row = await one<{ verified: boolean }>(`SELECT verified FROM ${table} WHERE user_id = $1 FOR UPDATE`, [id], c);
    if (!row) throw notFound(`No ${kind} with this id.`);
    if (body.decision === 'approve') {
      await c.query(`UPDATE ${table} SET verified = true, rejection_reason = NULL WHERE user_id = $1`, [id]);
      await c.query(`UPDATE users SET status = 'active' WHERE id = $1 AND status = 'pending'`, [id]);
      await notify(id, 'account_verified', 'Your account has been verified. You can now use all features.', null, c);
    } else {
      await c.query(`UPDATE ${table} SET verified = false, rejection_reason = $2 WHERE user_id = $1`, [id, body.reason]);
      await notify(id, 'account_rejected', `Your account could not be verified: ${body.reason}`, null, c);
    }
    await audit(c, req.user!.id, `${body.decision}_${kind}`, `${kind}:${id}`, body.reason ?? null);
  });
  res.json({ ok: true, decision: body.decision });
});

async function setUserStatus(
  c: pg.PoolClient,
  actor: { id: string; staffRole: string | null },
  userId: string,
  to: 'suspended' | 'active',
) {
  const u = await one<{ role: string; status: string; doctor_verified: boolean | null; pharmacy_verified: boolean | null }>(
    `SELECT u.role, u.status, d.verified AS doctor_verified, p.verified AS pharmacy_verified FROM users u
       LEFT JOIN doctors d ON d.user_id = u.id LEFT JOIN pharmacies p ON p.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL FOR UPDATE OF u`,
    [userId],
    c,
  );
  if (!u) throw notFound('User not found.');
  if (userId === actor.id) throw forbidden('You cannot change the status of your own account.');
  if (u.role === 'staff' && actor.staffRole !== 'admin') throw forbidden('Only an admin can change a staff account.');
  if (to === 'suspended' && u.status === 'suspended') throw conflict('This account is already suspended.');
  if (to === 'active' && u.status !== 'suspended') throw conflict('This account is not suspended.');
  // Reactivated professionals go back to "pending" until verified.
  const unverifiedPro = (u.role === 'doctor' && !u.doctor_verified) || (u.role === 'pharmacy' && !u.pharmacy_verified);
  const status = to === 'active' && unverifiedPro ? 'pending' : to;
  await c.query('UPDATE users SET status = $2 WHERE id = $1', [userId, status]);
  return status;
}

adminRouter.post('/users/:id/suspend', canModerate, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: reasonField }).parse(req.body);
  const status = await tx(async (c) => {
    const s = await setUserStatus(c, req.user!, id, 'suspended');
    await audit(c, req.user!.id, 'suspend_user', `user:${id}`, reason);
    return s;
  });
  res.json({ ok: true, status });
});

adminRouter.post('/users/:id/reactivate', canModerate, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: reasonField }).parse(req.body);
  const status = await tx(async (c) => {
    const s = await setUserStatus(c, req.user!, id, 'active');
    await audit(c, req.user!.id, 'reactivate_user', `user:${id}`, reason);
    return s;
  });
  res.json({ ok: true, status });
});

adminRouter.post('/staff', adminOnly, async (req, res) => {
  const body = z
    .object({
      email: emailField,
      password: passwordField,
      fullName: z.string().trim().min(2).max(80),
      staffRole: z.enum(['admin', 'support', 'moderator']),
    })
    .parse(req.body);
  const id = await tx(async (c) => {
    if (await one('SELECT 1 FROM users WHERE email = $1', [body.email], c)) throw conflict('An account with this email already exists.');
    const u = await one<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1,$2,'staff','active') RETURNING id`,
      [body.email, await bcrypt.hash(body.password, 10)],
      c,
    );
    await c.query('INSERT INTO staff (user_id, full_name, staff_role) VALUES ($1,$2,$3)', [u!.id, body.fullName, body.staffRole]);
    await audit(c, req.user!.id, 'create_staff', `user:${u!.id}`, `role ${body.staffRole}`);
    return u!.id;
  });
  res.status(201).json({ id });
});

const FORMS = ['tablet', 'capsule', 'syrup', 'drops', 'cream', 'sachet', 'spray', 'inhaler', 'pen', 'lozenge'] as const;
const medicineBody = z.object({
  cip13: z.string().regex(/^\d{13}$/, 'must be 13 digits'),
  name: z.string().trim().min(2).max(120),
  activeSubstance: z.string().trim().min(2).max(200),
  form: z.enum(FORMS),
  dosage: z.string().trim().min(1).max(60),
  category: z.string().trim().min(2).max(40),
  requiresPrescription: z.boolean(),
  imageUrl: z
    .url({ protocol: /^https?$/, message: 'must be an http(s) URL' })
    .max(500)
    .nullable()
    .optional(),
  description: z.string().trim().max(2000).optional(),
  ageNote: z.string().trim().max(200).optional(),
  descriptionEn: z.string().trim().max(2000).optional(),
  ageNoteEn: z.string().trim().max(200).optional(),
});
const COLS: Record<string, string> = {
  cip13: 'cip13',
  name: 'name',
  activeSubstance: 'active_substance',
  form: 'form',
  dosage: 'dosage',
  category: 'category',
  requiresPrescription: 'requires_prescription',
  imageUrl: 'image_url',
  description: 'description',
  ageNote: 'age_note',
  descriptionEn: 'description_en',
  ageNoteEn: 'age_note_en',
};

adminRouter.post('/medicines', canModerate, async (req, res) => {
  const b = medicineBody.parse(req.body);
  const id = await tx(async (c) => {
    const m = await one<{ id: string }>(
      `INSERT INTO medicines (cip13, name, active_substance, form, dosage, category, requires_prescription, image_url, description, age_note,
                              description_en, age_note_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        b.cip13,
        b.name,
        b.activeSubstance,
        b.form,
        b.dosage,
        b.category,
        b.requiresPrescription,
        b.imageUrl ?? null,
        b.description ?? '',
        b.ageNote ?? '',
        b.descriptionEn ?? '',
        b.ageNoteEn ?? '',
      ],
      c,
    );
    await audit(c, req.user!.id, 'create_medicine', `medicine:${m!.id}`, null);
    return m!.id;
  });
  res.status(201).json({ id });
});

adminRouter.patch('/medicines/:id', canModerate, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const b = medicineBody.partial().parse(req.body);
  const entries = Object.entries(b).filter(([, v]) => v !== undefined);
  if (!entries.length) throw badRequest('Nothing to update.');
  await tx(async (c) => {
    const sets = entries.map(([k], i) => `${COLS[k]} = $${i + 2}`).join(', ');
    const r = await c.query(`UPDATE medicines SET ${sets} WHERE id = $1 AND deleted_at IS NULL`, [id, ...entries.map(([, v]) => v)]);
    if (!r.rowCount) throw notFound('Medicine not found.');
    await audit(c, req.user!.id, 'update_medicine', `medicine:${id}`, `fields: ${entries.map(([k]) => k).join(', ')}`);
  });
  res.json({ ok: true });
});

adminRouter.delete('/medicines/:id', canModerate, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: reasonField }).parse(req.body ?? {});
  await tx(async (c) => {
    const r = await c.query('UPDATE medicines SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!r.rowCount) throw notFound('Medicine not found.');
    await audit(c, req.user!.id, 'delete_medicine', `medicine:${id}`, reason);
  });
  res.json({ ok: true });
});

adminRouter.post('/reports/:id/resolve', async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const { resolution } = z.object({ resolution: reasonField }).parse(req.body);
  await tx(async (c) => {
    const r = await c.query(`UPDATE reports SET status = 'resolved', resolution = $2 WHERE id = $1 AND status = 'open'`, [id, resolution]);
    if (!r.rowCount) throw notFound('No open report with this id.');
    await audit(c, req.user!.id, 'resolve_report', `report:${id}`, resolution);
  });
  res.json({ ok: true });
});

addRoutes([
  ['get', '/api/admin/stats', 'Admin', 'KPIs', 'bearer'],
  ['get', '/api/admin/users', 'Admin', 'Users with filters (role, status, q, page)', 'bearer'],
  ['get', '/api/admin/verifications', 'Admin', 'Verification queue (pending doctors and pharmacies)', 'bearer'],
  ['get', '/api/admin/pharmacies', 'Admin', 'Pharmacies', 'bearer'],
  ['get', '/api/admin/doctors', 'Admin', 'Doctors', 'bearer'],
  ['get', '/api/admin/medicines', 'Admin', 'Medicines (q, includeDeleted)', 'bearer'],
  ['get', '/api/admin/orders', 'Admin', 'Orders (status filter)', 'bearer'],
  ['get', '/api/admin/reports', 'Admin', 'Reports', 'bearer'],
  ['get', '/api/admin/audit', 'Admin', 'Audit log', 'bearer'],
  ['get', '/api/admin/performance', 'Admin', 'Pharmacy performance table', 'bearer'],
  ['post', '/api/admin/verify/:kind/:id', 'Admin', 'Approve or reject (with reason) a doctor or pharmacy — admin, moderator', 'bearer'],
  ['post', '/api/admin/users/:id/suspend', 'Admin', 'Suspend with reason — admin, moderator', 'bearer'],
  ['post', '/api/admin/users/:id/reactivate', 'Admin', 'Reactivate with reason — admin, moderator', 'bearer'],
  ['post', '/api/admin/staff', 'Admin', 'Create a staff account — admin only', 'bearer'],
  ['post', '/api/admin/medicines', 'Admin', 'Create a medicine — admin, moderator', 'bearer'],
  ['patch', '/api/admin/medicines/:id', 'Admin', 'Update a medicine — admin, moderator', 'bearer'],
  ['delete', '/api/admin/medicines/:id', 'Admin', 'Soft-delete a medicine with reason — admin, moderator', 'bearer'],
  ['post', '/api/admin/reports/:id/resolve', 'Admin', 'Resolve a report — any staff', 'bearer'],
]);
