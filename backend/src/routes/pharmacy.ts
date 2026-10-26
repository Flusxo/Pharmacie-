import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query, tx } from '../db.js';
import bcrypt from 'bcryptjs';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { addRoutes } from '../openapi.js';
import { langOf, tr } from '../i18n/index.js';
import {
  confirmPickup,
  decideCancellation,
  getPharmacyOrder,
  listIncoming,
  listPharmacyOrders,
  previewPickup,
  updateOrderStatus,
  type OrderStatus,
} from '../services/orders.js';
import { getPayment } from '../services/payments.js';
import { listOwnSubmissions, similarMedicines, submissionBody, submitMedicine, type SubmissionInput } from '../services/submissions.js';
import { getProfile } from '../services/profile.js';
import { acceptRequest, proposeSubstitution, refuseRequest } from '../services/requests.js';
import { emailField, idParam, passwordField, uuid } from '../validate.js';
import { profileBody } from '../pharmacyProfile.js';
import { listPrescriptionFiles, pharmacyMayListRequestFiles } from '../services/files.js';
import {
  deleteReply,
  listMessages,
  pharmacyReviews,
  postMessage,
  replyToReview,
  reportMessage,
  reportReview,
} from '../services/conversations.js';
import { messageLimiter } from './files.js';
import { logOrderViews, logRequestViews } from '../services/accessLog.js';
import { requireFeature } from '../services/settings.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const pharmacyRouter = Router();
pharmacyRouter.use(requireRole('pharmacy'));

/**
 * Team accounts. A pharmacist or an assistant is a user linked to the pharmacy; from here on every handler acts on the
 * pharmacy (req.user.id = the pharmacy) while the member's own id goes to the activity log.
 *  - owner: everything, plus the team.
 *  - pharmacist: everything except the team and the pause switch.
 *  - assistant: reads, and moves orders forward. No answers to requests, no stock changes.
 */
const LOG_SQL =
  'INSERT INTO pharmacy_activity (pharmacy_id, actor_user_id, actor_name, actor_role, action, target) VALUES ($1,$2,$3,$4,$5,$6)';
pharmacyRouter.use((req, res, next) => {
  const me = req.user!;
  const role = me.memberRole ?? 'owner';
  const actorId = me.id;
  const pharmacyId = me.pharmacyId ?? me.id;
  const p = req.path;
  const write = req.method !== 'GET';
  const ownerOnly = p.startsWith('/team') || (write && p === '/settings');
  const assistantMayWrite =
    (req.method === 'PATCH' && /^\/orders\/[^/]+\/status$/.test(p)) ||
    (req.method === 'POST' && (p === '/pickup/check' || /^\/orders\/[^/]+\/(pickup|messages)$/.test(p))) ||
    (req.method === 'POST' && /^\/messages\/\d+\/report$/.test(p));
  const assistantMayRead = !p.startsWith('/team') && !p.startsWith('/activity');
  if ((role !== 'owner' && ownerOnly) || (role === 'assistant' && (write ? !assistantMayWrite : !assistantMayRead))) {
    throw forbidden();
  }
  req.user = { ...me, id: pharmacyId, actorId };
  if (write && !p.startsWith('/team')) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void (async () => {
        const who = await one<{ name: string }>(
          'SELECT coalesce((SELECT display_name FROM pharmacy_members WHERE user_id = $1), (SELECT name FROM pharmacies WHERE user_id = $1)) AS name',
          [actorId],
        );
        const params = req.params as Record<string, string | undefined>;
        await pool.query(LOG_SQL, [
          pharmacyId,
          actorId,
          who?.name ?? '',
          role,
          req.method + ' ' + String(req.route?.path ?? p),
          params.id ?? params.medicineId ?? null,
        ]);
      })().catch(() => {});
    });
  }
  next();
});

// Requests and orders
pharmacyRouter.get('/incoming', async (req, res) => {
  const items = (await listIncoming(req.user!.id)) as { id: string }[];
  await logRequestViews(
    'request',
    { role: 'pharmacy', userId: req.user!.id },
    items.map((r) => r.id),
  );
  res.json({ items });
});

pharmacyRouter.post('/requests/:id/accept', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await acceptRequest(id, req.user!.id, req.user!.id));
});

pharmacyRouter.post('/requests/:id/refuse', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional().nullable() }).parse(req.body ?? {});
  res.json(await refuseRequest(id, req.user!.id, reason ?? null));
});

pharmacyRouter.post('/requests/:id/substitutions', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = z.object({ itemId: uuid, proposedMedicineId: uuid }).parse(req.body);
  res.status(201).json(await proposeSubstitution(id, req.user!.id, body.itemId, body.proposedMedicineId));
});

pharmacyRouter.get('/orders', async (req, res) => {
  const { scope } = z.object({ scope: z.enum(['active', 'all']).default('active') }).parse(req.query);
  const items = (await listPharmacyOrders(req.user!.id, scope)) as { id: string; status: string }[];
  // Only orders in progress count as "opened": the list of old orders is history, not a fresh look at the patient.
  await logOrderViews(
    'order',
    { role: 'pharmacy', userId: req.user!.id },
    items.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').map((o) => o.id),
  );
  res.json({ items });
});

pharmacyRouter.get('/orders/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const order = await getPharmacyOrder(id, req.user!.id);
  await logOrderViews('order', { role: 'pharmacy', userId: req.user!.id }, [id]);
  res.json({ order });
});

pharmacyRouter.get('/orders/:id/payment', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getPayment(id, { pharmacyId: req.user!.id }));
});

pharmacyRouter.patch('/orders/:id/status', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = z
    .object({
      status: z.enum(['preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'accepted']),
      prescriptionChecked: z.boolean().default(false),
    })
    .parse(req.body);
  res.json(await updateOrderStatus(id, req.user!.id, body.status as OrderStatus, req.user!.id, body.prescriptionChecked));
});

pharmacyRouter.post('/orders/:id/cancellation', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  res.json(await decideCancellation(id, req.user!.id, approve, req.user!.id));
});

// Inventory
pharmacyRouter.get('/inventory', async (req, res) => {
  const q = z.object({ low: z.enum(['0', '1', 'true', 'false']).optional(), q: z.string().trim().max(80).optional() }).parse(req.query);
  const lowOnly = q.low === '1' || q.low === 'true';
  const rows = await query(
    `SELECT m.id AS "medicineId", m.cip13, m.name, m.dosage, m.form, m.category, m.requires_prescription AS "requiresPrescription", m.status,
            i.quantity, i.price_eur AS "priceEur", i.low_stock_threshold AS "lowStockThreshold", i.updated_at AS "updatedAt",
            i.quantity <= i.low_stock_threshold AS low
       FROM pharmacy_inventory i JOIN medicines m ON m.id = i.medicine_id
      WHERE i.pharmacy_id = $1 AND m.deleted_at IS NULL
        AND (NOT $2 OR i.quantity <= i.low_stock_threshold)
        AND ($3::text IS NULL OR f_norm(m.name) LIKE '%' || f_norm($3) || '%' OR m.cip13 = $3)
      ORDER BY m.name`,
    [req.user!.id, lowOnly, q.q || null],
  );
  res.json({ items: rows });
});

const stockBody = z.object({
  quantity: z.number().int().min(0, 'cannot be negative').max(100_000),
  priceEur: z.number().min(0).max(10_000),
  lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
});

pharmacyRouter.put('/inventory/:medicineId', async (req, res) => {
  const { medicineId } = z.object({ medicineId: uuid }).parse(req.params);
  const body = stockBody.parse(req.body);
  const result = await tx(async (c) => {
    const m = await one(
      "SELECT 1 FROM medicines WHERE id = $1 AND deleted_at IS NULL AND (status = 'approved' OR submitted_by = $2)",
      [medicineId, req.user!.id],
      c,
    );
    if (!m) throw notFound('This medicine does not exist.');
    const before = await one<{ quantity: number }>(
      'SELECT quantity FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2 FOR UPDATE',
      [req.user!.id, medicineId],
      c,
    );
    await c.query(
      `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur, low_stock_threshold, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET quantity = $3, price_eur = $4, low_stock_threshold = $5, updated_at = now()`,
      [req.user!.id, medicineId, body.quantity, body.priceEur, body.lowStockThreshold],
    );
    if (before?.quantity !== body.quantity) {
      await c.query(
        `INSERT INTO inventory_history (pharmacy_id, medicine_id, old_qty, new_qty, reason, changed_by) VALUES ($1,$2,$3,$4,'manual',$1)`,
        [req.user!.id, medicineId, before?.quantity ?? null, body.quantity],
      );
    }
    return { medicineId, ...body, previousQuantity: before?.quantity ?? null };
  });
  res.json(result);
});

pharmacyRouter.delete('/inventory/:medicineId', async (req, res) => {
  const { medicineId } = z.object({ medicineId: uuid }).parse(req.params);
  await tx(async (c) => {
    const r = await one<{ quantity: number }>(
      'DELETE FROM pharmacy_inventory WHERE pharmacy_id = $1 AND medicine_id = $2 RETURNING quantity',
      [req.user!.id, medicineId],
      c,
    );
    if (!r) throw notFound('This medicine is not in your stock.');
    await c.query(
      `INSERT INTO inventory_history (pharmacy_id, medicine_id, old_qty, new_qty, reason, changed_by) VALUES ($1,$2,$3,0,'removed',$1)`,
      [req.user!.id, medicineId, r.quantity],
    );
  });
  res.json({ removed: true });
});

pharmacyRouter.get('/inventory/history', async (req, res) => {
  const { medicineId } = z.object({ medicineId: uuid.optional() }).parse(req.query);
  const rows = await query(
    `SELECT h.id, h.medicine_id AS "medicineId", m.name, h.old_qty AS "oldQty", h.new_qty AS "newQty", h.reason, h.changed_at AS "changedAt"
       FROM inventory_history h JOIN medicines m ON m.id = h.medicine_id
      WHERE h.pharmacy_id = $1 AND ($2::uuid IS NULL OR h.medicine_id = $2)
      ORDER BY h.changed_at DESC, h.id DESC LIMIT 200`,
    [req.user!.id, medicineId ?? null],
  );
  res.json({ items: rows });
});

interface CsvRow {
  line: number;
  cip13: string;
  name: string | null;
  medicineId: string | null;
  oldQuantity: number | null;
  quantity: number | null;
  priceEur: number | null;
  lowStockThreshold: number;
  /** unknown CIP13 with the full description: becomes a proposal for staff review */
  submit?: SubmissionInput;
  error: string | null;
}

/**
 * CSV bulk update. Header: cip13,quantity,price_eur[,low_stock_threshold] (comma or semicolon; with
 * semicolons a decimal comma is accepted, e.g. "4,50"). dryRun=true returns the preview with per-row errors.
 * Applying is refused while any row has an error.
 */
pharmacyRouter.post('/inventory/csv', async (req, res) => {
  const body = z.object({ csv: z.string().min(1, 'is empty').max(200_000), dryRun: z.boolean().default(true) }).parse(req.body);
  const lines = body.csv
    .trimStart() // also removes the byte-order mark Excel adds
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  const header = lines.shift() ?? '';
  const sep = header.includes(';') ? ';' : ',';
  const cols = header.split(sep).map((h) => h.trim().toLowerCase());
  const idx = {
    cip: cols.indexOf('cip13'),
    qty: cols.indexOf('quantity'),
    price: cols.indexOf('price_eur'),
    low: cols.indexOf('low_stock_threshold'),
    name: cols.indexOf('name'),
    substance: cols.indexOf('active_substance'),
    form: cols.indexOf('form'),
    dosage: cols.indexOf('dosage'),
    category: cols.indexOf('category'),
    rx: cols.indexOf('requires_prescription'),
  };
  const canSubmit = [idx.name, idx.substance, idx.form, idx.dosage, idx.category, idx.rx].every((i) => i >= 0);
  if (idx.cip < 0 || idx.qty < 0 || idx.price < 0) {
    throw badRequest('The first line must be the header: cip13,quantity,price_eur (optional: low_stock_threshold).');
  }
  if (lines.length > 2000) throw badRequest('At most 2000 rows per upload.');

  const meds = await query<{ id: string; cip13: string; name: string; quantity: number | null }>(
    `SELECT m.id, m.cip13, m.name, i.quantity FROM medicines m
       LEFT JOIN pharmacy_inventory i ON i.medicine_id = m.id AND i.pharmacy_id = $1
      WHERE m.deleted_at IS NULL AND (m.status = 'approved' OR m.submitted_by = $1)`,
    [req.user!.id],
  );
  const byCip = new Map(meds.map((m) => [m.cip13, m]));
  const num = (s: string | undefined) => {
    const v = (s ?? '').trim().replace(sep === ';' ? ',' : /^$/, '.');
    return v === '' ? NaN : Number(v);
  };
  const seen = new Set<string>();
  const rows: CsvRow[] = lines.map((l, i) => {
    const f = l.split(sep);
    const cip = (f[idx.cip] ?? '').trim();
    const m = byCip.get(cip);
    const qty = num(f[idx.qty]);
    const price = num(f[idx.price]);
    const low = idx.low >= 0 && (f[idx.low] ?? '').trim() !== '' ? num(f[idx.low]) : 5;
    let error: string | null = null;
    let submit: SubmissionInput | undefined;
    if (!m && canSubmit && /^\d{13}$/.test(cip)) {
      const parsed = submissionBody.safeParse({
        cip13: cip,
        name: f[idx.name]?.trim(),
        activeSubstance: f[idx.substance]?.trim(),
        form: f[idx.form]?.trim().toLowerCase(),
        dosage: f[idx.dosage]?.trim(),
        category: f[idx.category]?.trim(),
        requiresPrescription: ['1', 'true', 'oui', 'yes'].includes((f[idx.rx] ?? '').trim().toLowerCase()),
        stock: { quantity: qty, priceEur: price, lowStockThreshold: low },
      });
      if (parsed.success) submit = parsed.data;
    }
    if (!/^\d{13}$/.test(cip)) error = 'cip13 must be 13 digits';
    else if (!m && !submit) error = 'unknown CIP13 code';
    else if (seen.has(cip)) error = 'this CIP13 appears twice';
    else if (!Number.isInteger(qty) || qty < 0) error = 'quantity must be a whole number ≥ 0';
    else if (!Number.isFinite(price) || price < 0) error = 'price_eur must be a number ≥ 0';
    else if (!Number.isInteger(low) || low < 0) error = 'low_stock_threshold must be a whole number ≥ 0';
    seen.add(cip);
    return {
      line: i + 2,
      cip13: cip,
      name: m?.name ?? null,
      medicineId: m?.id ?? null,
      oldQuantity: m?.quantity ?? null,
      quantity: Number.isFinite(qty) ? qty : null,
      priceEur: Number.isFinite(price) ? price : null,
      lowStockThreshold: low,
      submit,
      error,
    };
  });
  // A new medicine that looks like an existing one is reported before anything is written.
  for (const r of rows) {
    if (r.submit && !r.error) {
      const similar = await similarMedicines(r.submit);
      if (similar.length) {
        const { name: existingName, cip13: existingCip } = similar[0];
        r.error = `looks like an existing medicine (${existingName}, ${existingCip}): use its CIP13 code`;
      }
    }
  }
  const errors = rows.filter((r) => r.error).length;
  // Row errors in the reader's language.
  const lang = langOf(req);
  const shown = (list: CsvRow[]) => list.map((r) => ({ ...r, error: r.error && tr(r.error, lang) }));
  if (body.dryRun) {
    res.json({ dryRun: true, rows: shown(rows), errors, valid: rows.length - errors });
    return;
  }
  if (errors) {
    throw badRequest(`Fix the ${errors} row(s) with errors before applying.`, shown(rows.filter((r) => r.error)));
  }
  await tx(async (c) => {
    for (const r of rows) {
      if (r.submit) {
        await submitMedicine(c, req.user!.id, r.submit);
        continue;
      }
      await c.query(
        `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur, low_stock_threshold, updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET quantity = $3, price_eur = $4, low_stock_threshold = $5, updated_at = now()`,
        [req.user!.id, r.medicineId, r.quantity, r.priceEur, r.lowStockThreshold],
      );
      if (r.oldQuantity !== r.quantity) {
        await c.query(
          `INSERT INTO inventory_history (pharmacy_id, medicine_id, old_qty, new_qty, reason, changed_by) VALUES ($1,$2,$3,$4,'csv',$1)`,
          [req.user!.id, r.medicineId, r.oldQuantity, r.quantity],
        );
      }
    }
  });
  res.json({ dryRun: false, applied: rows.length, submitted: rows.filter((r) => r.submit).length });
});

// ---------- Proposing a medicine that is not in the catalogue yet ----------

pharmacyRouter.post('/medicines', async (req, res) => {
  const body = submissionBody.parse(req.body);
  const id = await tx((c) => submitMedicine(c, req.user!.id, body));
  res.status(201).json({ id, status: 'pending' });
});

pharmacyRouter.get('/medicines/proposals', async (req, res) => {
  res.json({ items: await listOwnSubmissions(req.user!.id) });
});

/** Same check as the proposal, without storing anything: the form asks it as the pharmacy types. */
pharmacyRouter.post('/medicines/check', async (req, res) => {
  const b = z
    .object({ name: z.string().trim().min(2).max(120), dosage: z.string().trim().min(1).max(60), cip13: z.string().trim().optional() })
    .parse(req.body);
  const byCip =
    b.cip13 && /^\d{13}$/.test(b.cip13)
      ? await one('SELECT id, name, dosage, form, cip13 FROM medicines WHERE cip13 = $1 AND deleted_at IS NULL AND status = $2', [
          b.cip13,
          'approved',
        ])
      : undefined;
  res.json({ candidates: byCip ? [byCip] : await similarMedicines(b) });
});

/** "Mark all out of stock" switch: a paused pharmacy is never proposed and cannot accept. */
pharmacyRouter.patch('/settings', async (req, res) => {
  // paused: the manual switch. breakMinutes: pause now and come back by itself after that many minutes (0 = switch off).
  const b = z
    .object({ paused: z.boolean().optional(), breakMinutes: z.number().int().min(0).max(240).optional() })
    .refine((v) => v.paused !== undefined || v.breakMinutes !== undefined, { message: 'Send paused or breakMinutes.' })
    .parse(req.body);
  if (b.breakMinutes !== undefined && b.breakMinutes > 0) {
    await pool.query("UPDATE pharmacies SET paused = true, paused_until = now() + ($2 || ' minutes')::interval WHERE user_id = $1", [
      req.user!.id,
      String(b.breakMinutes),
    ]);
  } else {
    await pool.query('UPDATE pharmacies SET paused = $2, paused_until = NULL WHERE user_id = $1', [req.user!.id, b.paused ?? false]);
  }
  res.json({ user: await getProfile(req.user!.id) });
});

/** Today (Europe/Paris): received, accepted, refused, expired, average response time. */
pharmacyRouter.get('/summary', async (req, res) => {
  const s = await one(
    `SELECT count(*)::int AS received,
            count(*) FILTER (WHERE response = 'accepted')::int AS accepted,
            count(*) FILTER (WHERE response = 'refused')::int AS refused,
            count(*) FILTER (WHERE response = 'expired')::int AS expired,
            count(*) FILTER (WHERE response = 'pending')::int AS pending,
            round(avg(extract(epoch FROM responded_at - sent_at) / 60) FILTER (WHERE response IN ('accepted', 'refused'))::numeric, 1)::float
              AS "avgResponseMinutes"
       FROM request_pharmacies
      WHERE pharmacy_id = $1 AND (sent_at AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date`,
    [req.user!.id],
  );
  const extra = await one(
    `SELECT (SELECT count(*) FROM orders WHERE pharmacy_id = $1 AND status NOT IN ('delivered', 'cancelled'))::int AS "activeOrders",
            (SELECT count(*) FROM pharmacy_inventory WHERE pharmacy_id = $1 AND quantity <= low_stock_threshold)::int AS "lowStock"`,
    [req.user!.id],
  );
  res.json({ ...s, ...extra });
});

// Pickup at the counter: look at the order a code belongs to, then confirm. Rate limited: a code is short.
const pickupLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.PICKUP_RATE_LIMIT ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.actorId ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: 'Too many pickup attempts. Please wait a minute.', code: 'rate_limited' },
});
pharmacyRouter.post('/pickup/check', pickupLimiter, async (req, res) => {
  const b = z.object({ orderId: uuid, code: z.string().trim().min(4).max(20) }).parse(req.body);
  const preview = await previewPickup(b.orderId, req.user!.id, b.code);
  await logOrderViews('order', { role: 'pharmacy', userId: req.user!.id }, [b.orderId]);
  res.json(preview);
});
pharmacyRouter.post('/orders/:id/pickup', pickupLimiter, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const b = z.object({ code: z.string().trim().min(4).max(20) }).parse(req.body);
  res.json(await confirmPickup(id, req.user!.id, b.code, req.user!.actorId ?? req.user!.id));
});

// Messages with the patient of an order, and reviews of this pharmacy
const messageBody = z.object({ body: z.string().trim().min(1, 'is empty').max(500, 'is too long (500 characters at most)') });
pharmacyRouter.get('/orders/:id/messages', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ items: await listMessages(id, 'pharmacy', req.user!.id) });
});
pharmacyRouter.post(
  '/orders/:id/messages',
  requireFeature('messages', 'Messages are switched off for now.'),
  messageLimiter,
  async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { body } = messageBody.parse(req.body);
    res.status(201).json(await postMessage(id, 'pharmacy', req.user!.id, req.user!.actorId ?? req.user!.id, body));
  },
);
pharmacyRouter.post('/messages/:id/report', async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  await reportMessage(id, 'pharmacy', req.user!.id, req.user!.actorId ?? req.user!.id, reason);
  res.status(201).json({ ok: true });
});
pharmacyRouter.get('/reviews', async (req, res) => {
  res.json(await pharmacyReviews(req.user!.id));
});
pharmacyRouter.post('/reviews/:id/report', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  await reportReview(id, req.user!.id, req.user!.actorId ?? req.user!.id, reason);
  res.status(201).json({ ok: true });
});

// One reply per review, by an owner or a pharmacist (the team rule above keeps assistants out of every write).
pharmacyRouter.post('/reviews/:id/reply', requireFeature('reviews', 'Reviews are switched off for now.'), async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { text } = z
    .object({ text: z.string().trim().min(2, 'is too short').max(300, 'is too long (300 characters at most)') })
    .parse(req.body);
  await replyToReview(id, req.user!.id, text);
  res.status(201).json({ ok: true });
});
pharmacyRouter.delete('/reviews/:id/reply', async (req, res) => {
  const { id } = idParam.parse(req.params);
  await deleteReply(id, req.user!.id);
  res.json({ ok: true });
});

/** Prescription files of a request this pharmacy was chosen for (the files themselves: GET /api/files/:id). */
pharmacyRouter.get('/requests/:id/files', async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await pharmacyMayListRequestFiles(id, req.user!.id))) throw notFound('Request not found.');
  res.json({ items: await listPrescriptionFiles(id) });
});

/** Profile page details: services, languages spoken, accessibility. */
pharmacyRouter.patch('/profile', async (req, res) => {
  const b = profileBody.parse(req.body);
  await pool.query('UPDATE pharmacies SET services = $2, languages = $3, accessibility = $4 WHERE user_id = $1', [
    req.user!.id,
    JSON.stringify(b.services),
    JSON.stringify(b.languages),
    JSON.stringify(b.accessibility),
  ]);
  res.json({ user: await getProfile(req.user!.id) });
});

// Team (owner only) and activity log (owner and pharmacist)
pharmacyRouter.get('/team', async (req, res) => {
  const items = await query(
    `SELECT m.user_id AS id, u.email, m.display_name AS "displayName", m.member_role AS role, m.created_at AS "createdAt"
       FROM pharmacy_members m JOIN users u ON u.id = m.user_id
      WHERE m.pharmacy_id = $1 AND u.deleted_at IS NULL ORDER BY m.created_at`,
    [req.user!.id],
  );
  res.json({ items });
});

pharmacyRouter.post('/team', async (req, res) => {
  const b = z
    .object({
      email: emailField,
      displayName: z.string().trim().min(2).max(60),
      password: passwordField,
      role: z.enum(['pharmacist', 'assistant']),
    })
    .parse(req.body);
  const hash = await bcrypt.hash(b.password, 10);
  const id = await tx(async (c) => {
    if (await one('SELECT 1 FROM users WHERE email = $1', [b.email], c)) {
      throw conflict('An account with this email already exists.');
    }
    const u = await one<{ id: string }>(
      "INSERT INTO users (email, password_hash, role, status) VALUES ($1,$2,'pharmacy','active') RETURNING id",
      [b.email, hash],
      c,
    );
    await c.query('INSERT INTO pharmacy_members (user_id, pharmacy_id, member_role, display_name) VALUES ($1,$2,$3,$4)', [
      u!.id,
      req.user!.id,
      b.role,
      b.displayName,
    ]);
    await c.query(LOG_SQL, [req.user!.id, req.user!.id, '', 'owner', 'POST /team', u!.id]);
    return u!.id;
  });
  res.status(201).json({ id });
});

pharmacyRouter.delete('/team/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const done = await pool.query(
    'UPDATE users SET deleted_at = now() WHERE id = $1 AND id IN (SELECT user_id FROM pharmacy_members WHERE pharmacy_id = $2) AND deleted_at IS NULL',
    [id, req.user!.id],
  );
  if (!done.rowCount) throw notFound('Team member not found.');
  await pool.query(LOG_SQL, [req.user!.id, req.user!.id, '', 'owner', 'DELETE /team/:id', id]);
  res.status(204).end();
});

pharmacyRouter.get('/activity', async (req, res) => {
  const items = await query(
    `SELECT id, actor_name AS "actorName", actor_role AS "actorRole", action, target, created_at AS "createdAt"
       FROM pharmacy_activity WHERE pharmacy_id = $1 ORDER BY id DESC LIMIT 100`,
    [req.user!.id],
  );
  res.json({ items });
});

addRoutes([
  ['get', '/api/pharmacy/orders/:id/messages', 'Pharmacy', 'Messages of an order', 'bearer'],
  ['post', '/api/pharmacy/orders/:id/messages', 'Pharmacy', 'Answer the patient (text, 500 characters, rate limited)', 'bearer'],
  ['post', '/api/pharmacy/messages/:id/report', 'Pharmacy', 'Report a message', 'bearer'],
  ['get', '/api/pharmacy/reviews', 'Pharmacy', 'Reviews of my pharmacy', 'bearer'],
  ['post', '/api/pharmacy/reviews/:id/report', 'Pharmacy', 'Report a review to staff', 'bearer'],
  ['post', '/api/pharmacy/reviews/:id/reply', 'Pharmacy', 'Reply once to a review (300 characters; owner or pharmacist)', 'bearer'],
  ['delete', '/api/pharmacy/reviews/:id/reply', 'Pharmacy', 'Take my reply back', 'bearer'],
  ['get', '/api/pharmacy/requests/:id/files', 'Pharmacy', 'Prescription files of a request I was chosen for', 'bearer'],
  ['post', '/api/pharmacy/pickup/check', 'Pharmacy', 'Check a pickup code (from the patient or its QR code) and see the order', 'bearer'],
  ['post', '/api/pharmacy/orders/:id/pickup', 'Pharmacy', 'Confirm pickup with the code: ready -> delivered in one step', 'bearer'],
  ['patch', '/api/pharmacy/profile', 'Pharmacy', 'Services, languages spoken and accessibility shown on my profile page', 'bearer'],
  ['get', '/api/pharmacy/team', 'Pharmacy', 'My team (owner only)', 'bearer'],
  ['post', '/api/pharmacy/team', 'Pharmacy', 'Add a pharmacist or an assistant (owner only)', 'bearer'],
  ['delete', '/api/pharmacy/team/:id', 'Pharmacy', 'Remove a team member (owner only)', 'bearer'],
  ['get', '/api/pharmacy/activity', 'Pharmacy', 'Activity log of the pharmacy', 'bearer'],
  ['get', '/api/pharmacy/incoming', 'Pharmacy', 'Requests waiting for my answer (patient shown as "First L.")', 'bearer'],
  ['post', '/api/pharmacy/requests/:id/accept', 'Pharmacy', 'Accept (one transaction; exactly one winner)', 'bearer'],
  ['post', '/api/pharmacy/requests/:id/refuse', 'Pharmacy', 'Refuse (request returns to the patient)', 'bearer'],
  ['post', '/api/pharmacy/requests/:id/substitutions', 'Pharmacy', 'Propose a generic for one item', 'bearer'],
  ['get', '/api/pharmacy/orders', 'Pharmacy', 'My orders (scope=active|all)', 'bearer'],
  ['get', '/api/pharmacy/orders/:id', 'Pharmacy', 'One of my orders (printable slip; patient as "First L.")', 'bearer'],
  ['patch', '/api/pharmacy/orders/:id/status', 'Pharmacy', 'Move an order forward (or cancel before delivery)', 'bearer'],
  ['post', '/api/pharmacy/orders/:id/cancellation', 'Pharmacy', "Approve or decline a patient's cancellation request", 'bearer'],
  [
    'post',
    '/api/pharmacy/medicines',
    'Pharmacy',
    'Propose a medicine that is not in the catalogue (duplicates detected; staff review)',
    'bearer',
  ],
  ['get', '/api/pharmacy/medicines/proposals', 'Pharmacy', 'My proposals and their review status', 'bearer'],
  ['post', '/api/pharmacy/medicines/check', 'Pharmacy', 'Look for similar existing medicines before proposing one', 'bearer'],
  ['get', '/api/pharmacy/inventory', 'Pharmacy', 'My stock (low=1 for low stock only)', 'bearer'],
  ['put', '/api/pharmacy/inventory/:medicineId', 'Pharmacy', 'Set stock, price and threshold (history kept)', 'bearer'],
  ['delete', '/api/pharmacy/inventory/:medicineId', 'Pharmacy', 'Remove a medicine from my stock', 'bearer'],
  ['get', '/api/pharmacy/inventory/history', 'Pharmacy', 'Stock change history', 'bearer'],
  ['post', '/api/pharmacy/inventory/csv', 'Pharmacy', 'CSV bulk update with preview (dryRun) and per-row errors', 'bearer'],
  ['patch', '/api/pharmacy/settings', 'Pharmacy', '"Mark all out of stock" switch (paused)', 'bearer'],
  ['get', '/api/pharmacy/summary', 'Pharmacy', 'Daily summary', 'bearer'],
]);
