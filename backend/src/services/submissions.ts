/**
 * Medicines proposed by pharmacies. A proposal is "pending": only the pharmacy that made it (and staff) can see
 * it, patients never do, until staff approve it. Duplicates are detected before anything is stored.
 */
import { z } from 'zod';
import type pg from 'pg';
import { one, query, tx, type Db } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { notify } from '../notify.js';

export const FORMS = ['tablet', 'capsule', 'syrup', 'drops', 'cream', 'sachet', 'spray', 'inhaler', 'pen', 'lozenge'] as const;
export const MAX_PENDING_PER_PHARMACY = 20;

export const submissionBody = z.object({
  cip13: z
    .string()
    .trim()
    .regex(/^\d{13}$/, 'must be 13 digits'),
  name: z.string().trim().min(2).max(120),
  activeSubstance: z.string().trim().min(2).max(200),
  form: z.enum(FORMS),
  dosage: z.string().trim().min(1).max(60),
  category: z.string().trim().min(2).max(40),
  requiresPrescription: z.boolean(),
  description: z.string().trim().max(2000).optional(),
  /** The pharmacy confirms that its medicine is different from the similar ones that were shown. */
  confirmNew: z.boolean().default(false),
  /** Optional first stock for this pharmacy. */
  stock: z
    .object({
      quantity: z.number().int().min(0).max(100_000),
      priceEur: z.number().min(0).max(10_000),
      lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
    })
    .optional(),
});
export type SubmissionInput = z.infer<typeof submissionBody>;

export interface Candidate {
  id: string;
  name: string;
  dosage: string;
  form: string;
  cip13: string;
}

/** Medicines of the catalogue that look like the proposal: same name and dosage, or very similar text. */
export async function similarMedicines(input: Pick<SubmissionInput, 'name' | 'dosage'>, db?: Db): Promise<Candidate[]> {
  return query<Candidate>(
    `SELECT id, name, dosage, form, cip13 FROM medicines
      WHERE deleted_at IS NULL AND status = 'approved'
        AND ((f_norm(name) = f_norm($1) AND f_norm(dosage) = f_norm($2))
             OR similarity(f_norm(name || ' ' || dosage), f_norm($1 || ' ' || $2)) >= 0.75)
      ORDER BY similarity(f_norm(name || ' ' || dosage), f_norm($1 || ' ' || $2)) DESC, name
      LIMIT 5`,
    [input.name, input.dosage],
    db,
  );
}

async function audit(db: Db, actorId: string, action: string, target: string, reason: string | null): Promise<void> {
  await db.query('INSERT INTO audit_log (actor_user_id, action, target, reason) VALUES ($1,$2,$3,$4)', [actorId, action, target, reason]);
}

/** Stores one proposal (inside the caller's transaction). Throws 409 with the candidates when it looks like a duplicate. */
export async function submitMedicine(c: pg.PoolClient, pharmacyId: string, input: SubmissionInput): Promise<string> {
  const byCip = await one<{ id: string; status: string; submitted_by: string | null; name: string; dosage: string; form: string }>(
    'SELECT id, status, submitted_by, name, dosage, form FROM medicines WHERE cip13 = $1 AND deleted_at IS NULL',
    [input.cip13],
    c,
  );
  if (byCip) {
    if (byCip.status === 'approved') {
      throw new HttpError(409, 'A medicine with this CIP13 code already exists. Use it instead of creating a new one.', 'duplicate_cip13', {
        candidates: [{ id: byCip.id, name: byCip.name, dosage: byCip.dosage, form: byCip.form, cip13: input.cip13 }],
      });
    }
    throw conflict('A medicine with this CIP13 code has already been proposed and is waiting for review.', 'already_submitted');
  }
  const pending = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM medicines WHERE submitted_by = $1 AND status = 'pending' AND deleted_at IS NULL",
    [pharmacyId],
    c,
  );
  if ((pending?.n ?? 0) >= MAX_PENDING_PER_PHARMACY) {
    throw conflict(
      `You already have ${MAX_PENDING_PER_PHARMACY} proposals waiting for review. Wait for staff to review them.`,
      'too_many_pending',
    );
  }
  if (!input.confirmNew) {
    const candidates = await similarMedicines(input, c);
    if (candidates.length) {
      throw new HttpError(
        409,
        'This medicine looks like one that already exists. Use the existing one, or confirm that yours is different.',
        'possible_duplicate',
        { candidates },
      );
    }
  }
  const m = await one<{ id: string }>(
    `INSERT INTO medicines (cip13, name, active_substance, form, dosage, category, requires_prescription, description, status, submitted_by, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,now()) RETURNING id`,
    [
      input.cip13,
      input.name,
      input.activeSubstance,
      input.form,
      input.dosage,
      input.category,
      input.requiresPrescription,
      input.description ?? '',
      pharmacyId,
    ],
    c,
  );
  if (input.stock) {
    await c.query(
      `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur, low_stock_threshold) VALUES ($1,$2,$3,$4,$5)`,
      [pharmacyId, m!.id, input.stock.quantity, input.stock.priceEur, input.stock.lowStockThreshold],
    );
    await c.query(
      `INSERT INTO inventory_history (pharmacy_id, medicine_id, old_qty, new_qty, reason, changed_by) VALUES ($1,$2,NULL,$3,'new_medicine',$1)`,
      [pharmacyId, m!.id, input.stock.quantity],
    );
  }
  await audit(c, pharmacyId, 'submit_medicine', `medicine:${m!.id}`, input.confirmNew ? 'pharmacy confirmed it is not a duplicate' : null);
  return m!.id;
}

/** The pharmacy's own proposals with their status and the reviewer's note. */
export async function listOwnSubmissions(pharmacyId: string) {
  return query(
    `SELECT id, cip13, name, dosage, form, category, status, review_note AS "reviewNote", submitted_at AS "submittedAt", reviewed_at AS "reviewedAt"
       FROM medicines WHERE submitted_by = $1 AND deleted_at IS NULL ORDER BY submitted_at DESC LIMIT 100`,
    [pharmacyId],
  );
}

/** Staff: proposals waiting for review (or already reviewed), with the pharmacy that made them and its similar existing medicines. */
export async function listReviewQueue(status: 'pending' | 'approved' | 'rejected') {
  const rows = await query<Record<string, unknown> & { name: string; dosage: string; form: string }>(
    `SELECT m.id, m.cip13, m.name, m.active_substance AS "activeSubstance", m.form, m.dosage, m.category,
            m.requires_prescription AS "requiresPrescription", m.description, m.status, m.review_note AS "reviewNote",
            m.submitted_at AS "submittedAt", m.reviewed_at AS "reviewedAt", p.name AS "pharmacyName", p.city AS "pharmacyCity"
       FROM medicines m JOIN pharmacies p ON p.user_id = m.submitted_by
      WHERE m.submitted_by IS NOT NULL AND m.deleted_at IS NULL AND m.status = $1
      ORDER BY m.submitted_at ASC LIMIT 200`,
    [status],
  );
  const out = [];
  for (const r of rows) out.push({ ...r, similar: await similarMedicines(r) });
  return out;
}

/** Staff decision. Approving makes the medicine visible to patients; rejecting keeps it hidden and tells the pharmacy why. */
export async function reviewSubmission(id: string, staffId: string, approve: boolean, note: string | null) {
  return tx(async (c) => {
    const m = await one<{ id: string; status: string; submitted_by: string | null }>(
      'SELECT id, status, submitted_by FROM medicines WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id],
      c,
    );
    if (!m || !m.submitted_by) throw notFound('Medicine proposal not found.');
    if (m.status !== 'pending') throw conflict('This proposal has already been reviewed.', 'already_reviewed');
    await c.query(`UPDATE medicines SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 WHERE id = $1`, [
      id,
      approve ? 'approved' : 'rejected',
      staffId,
      note,
    ]);
    await audit(c, staffId, approve ? 'approve_medicine' : 'reject_medicine', `medicine:${id}`, note);
    const why = note ?? 'see the review note';
    await notify(
      m.submitted_by,
      'medicine_review',
      approve ? 'Your medicine proposal was approved. Patients can now find it.' : `Your medicine proposal was not accepted: ${why}`,
      '/pharmacy',
      c,
    );
    return { id, status: approve ? 'approved' : 'rejected' };
  });
}
