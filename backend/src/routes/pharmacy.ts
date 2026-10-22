import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query, tx } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { addRoutes } from '../openapi.js';
import { langOf, tr } from '../i18n/index.js';
import {
  decideCancellation,
  getPharmacyOrder,
  listIncoming,
  listPharmacyOrders,
  updateOrderStatus,
  type OrderStatus,
} from '../services/orders.js';
import { getPayment } from '../services/payments.js';
import { getProfile } from '../services/profile.js';
import { acceptRequest, proposeSubstitution, refuseRequest } from '../services/requests.js';
import { idParam, uuid } from '../validate.js';

export const pharmacyRouter = Router();
pharmacyRouter.use(requireRole('pharmacy'));

// Requests and orders
pharmacyRouter.get('/incoming', async (req, res) => {
  res.json({ items: await listIncoming(req.user!.id) });
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
  res.json({ items: await listPharmacyOrders(req.user!.id, scope) });
});

pharmacyRouter.get('/orders/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ order: await getPharmacyOrder(id, req.user!.id) });
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
    `SELECT m.id AS "medicineId", m.cip13, m.name, m.dosage, m.form, m.category, m.requires_prescription AS "requiresPrescription",
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
    const m = await one('SELECT 1 FROM medicines WHERE id = $1 AND deleted_at IS NULL', [medicineId], c);
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
  };
  if (idx.cip < 0 || idx.qty < 0 || idx.price < 0) {
    throw badRequest('The first line must be the header: cip13,quantity,price_eur (optional: low_stock_threshold).');
  }
  if (lines.length > 2000) throw badRequest('At most 2000 rows per upload.');

  const meds = await query<{ id: string; cip13: string; name: string; quantity: number | null }>(
    `SELECT m.id, m.cip13, m.name, i.quantity FROM medicines m
       LEFT JOIN pharmacy_inventory i ON i.medicine_id = m.id AND i.pharmacy_id = $1 WHERE m.deleted_at IS NULL`,
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
    if (!/^\d{13}$/.test(cip)) error = 'cip13 must be 13 digits';
    else if (!m) error = 'unknown CIP13 code';
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
      error,
    };
  });
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
  res.json({ dryRun: false, applied: rows.length });
});

/** "Mark all out of stock" switch: a paused pharmacy is never proposed and cannot accept. */
pharmacyRouter.patch('/settings', async (req, res) => {
  const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
  await pool.query('UPDATE pharmacies SET paused = $2 WHERE user_id = $1', [req.user!.id, paused]);
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

addRoutes([
  ['get', '/api/pharmacy/incoming', 'Pharmacy', 'Requests waiting for my answer (patient shown as "First L.")', 'bearer'],
  ['post', '/api/pharmacy/requests/:id/accept', 'Pharmacy', 'Accept (one transaction; exactly one winner)', 'bearer'],
  ['post', '/api/pharmacy/requests/:id/refuse', 'Pharmacy', 'Refuse (request returns to the patient)', 'bearer'],
  ['post', '/api/pharmacy/requests/:id/substitutions', 'Pharmacy', 'Propose a generic for one item', 'bearer'],
  ['get', '/api/pharmacy/orders', 'Pharmacy', 'My orders (scope=active|all)', 'bearer'],
  ['get', '/api/pharmacy/orders/:id', 'Pharmacy', 'One of my orders (printable slip; patient as "First L.")', 'bearer'],
  ['patch', '/api/pharmacy/orders/:id/status', 'Pharmacy', 'Move an order forward (or cancel before delivery)', 'bearer'],
  ['post', '/api/pharmacy/orders/:id/cancellation', 'Pharmacy', "Approve or decline a patient's cancellation request", 'bearer'],
  ['get', '/api/pharmacy/inventory', 'Pharmacy', 'My stock (low=1 for low stock only)', 'bearer'],
  ['put', '/api/pharmacy/inventory/:medicineId', 'Pharmacy', 'Set stock, price and threshold (history kept)', 'bearer'],
  ['delete', '/api/pharmacy/inventory/:medicineId', 'Pharmacy', 'Remove a medicine from my stock', 'bearer'],
  ['get', '/api/pharmacy/inventory/history', 'Pharmacy', 'Stock change history', 'bearer'],
  ['post', '/api/pharmacy/inventory/csv', 'Pharmacy', 'CSV bulk update with preview (dryRun) and per-row errors', 'bearer'],
  ['patch', '/api/pharmacy/settings', 'Pharmacy', '"Mark all out of stock" switch (paused)', 'bearer'],
  ['get', '/api/pharmacy/summary', 'Pharmacy', 'Daily summary', 'bearer'],
]);
