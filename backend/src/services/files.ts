import { one, pool, query } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import type { AuthUser } from '../middleware/auth.js';

/** Private files live in the database (table private_files). Every read goes through access() below. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 3;
export const MAX_VERIFICATION_FILES = 5;
/** A prescription photo is deleted 48 h after the request or order ends, or 30 days after upload at the latest. */
export const PRESCRIPTION_TTL_DAYS = 30;
export const VERIFICATION_TTL_DAYS = 30;

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AllowedType = (typeof ALLOWED_TYPES)[number];

/** What the bytes really are (the declared type is not trusted): JPEG, PNG, WebP or PDF, by their first bytes. */
export function sniff(b: Buffer): AllowedType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** A safe display name: no path, no control characters, at most 80 characters. */
export function cleanFilename(raw: string | undefined, type: AllowedType): string {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[type];
  let name = '';
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = '';
  }
  name = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\p{L}\p{N} ._()-]/gu, '')
    .trim()
    .slice(0, 80);
  return name && /\.[A-Za-z0-9]{2,5}$/.test(name) ? name : `${name || 'file'}.${ext}`;
}

export interface FileMeta {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export function readBody(body: unknown, declared: string | undefined): { buf: Buffer; type: AllowedType } {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new HttpError(415, 'Send the file itself with its type (JPEG, PNG, WebP or PDF).', 'unsupported_file');
  }
  const type = sniff(body);
  if (!type || (declared && declared.split(';')[0].trim() !== type)) {
    throw new HttpError(415, 'This file is not a JPEG, PNG, WebP or PDF, or its content does not match its type.', 'unsupported_file');
  }
  return { buf: body, type };
}

export async function savePrescription(patientId: string, requestId: string, filename: string, buf: Buffer, type: AllowedType) {
  const r = await one<{ status: string }>('SELECT status FROM requests WHERE id = $1 AND patient_id = $2', [requestId, patientId]);
  if (!r) throw notFound('Request not found.');
  if (r.status === 'cancelled' || r.status === 'expired') throw conflict('This request is over: files can no longer be added.');
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM private_files WHERE request_id = $1 AND purpose = 'prescription'", [
    requestId,
  ]);
  if ((n?.n ?? 0) >= MAX_FILES_PER_REQUEST) throw conflict('At most 3 files can be attached to a request.', 'too_many_files');
  return insert('prescription', patientId, requestId, filename, buf, type, PRESCRIPTION_TTL_DAYS);
}

export async function saveVerification(userId: string, filename: string, buf: Buffer, type: AllowedType) {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM private_files WHERE owner_user_id = $1 AND purpose = 'verification'", [
    userId,
  ]);
  if ((n?.n ?? 0) >= MAX_VERIFICATION_FILES) throw conflict('At most 5 documents can be sent.', 'too_many_files');
  return insert('verification', userId, null, filename, buf, type, VERIFICATION_TTL_DAYS);
}

async function insert(
  purpose: string,
  owner: string,
  requestId: string | null,
  filename: string,
  buf: Buffer,
  type: AllowedType,
  ttlDays: number,
) {
  const row = await one<FileMeta>(
    `INSERT INTO private_files (purpose, owner_user_id, request_id, filename, content_type, size_bytes, data, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(days => $8))
     RETURNING id, filename, content_type AS "contentType", size_bytes AS "sizeBytes", created_at AS "createdAt"`,
    [purpose, owner, requestId, filename, type, buf.length, buf, ttlDays],
  );
  return row!;
}

const META = `f.id, f.filename, f.content_type AS "contentType", f.size_bytes AS "sizeBytes", f.created_at AS "createdAt"`;

export const listPrescriptionFiles = (requestId: string) =>
  query<FileMeta>(`SELECT ${META} FROM private_files f WHERE f.request_id = $1 AND f.purpose = 'prescription' ORDER BY f.created_at`, [
    requestId,
  ]);

export const listVerificationFiles = (userId: string) =>
  query<FileMeta>(`SELECT ${META} FROM private_files f WHERE f.owner_user_id = $1 AND f.purpose = 'verification' ORDER BY f.created_at`, [
    userId,
  ]);

/**
 * Who may read a file, in one place:
 *  - a prescription: the patient who sent it, and the pharmacy the patient chose for that request. Nobody else: not a doctor,
 *    not another pharmacy, not staff.
 *  - a verification document: the applicant, and staff.
 * A person without access gets "not found", the same answer as for a file that does not exist.
 * For pharmacy accounts, user.id is the pharmacy (team members act as their pharmacy), see routes/pharmacy.ts.
 */
export async function readFile(fileId: string, user: AuthUser, pharmacyId: string | null) {
  const f = await one<{
    id: string;
    purpose: string;
    owner_user_id: string;
    request_id: string | null;
    filename: string;
    content_type: string;
    data: Buffer;
  }>(
    'SELECT id, purpose, owner_user_id, request_id, filename, content_type, data FROM private_files WHERE id = $1 AND expires_at > now()',
    [fileId],
  );
  if (!f) throw notFound('File not found.');
  let allowed = f.owner_user_id === user.id;
  if (!allowed && f.purpose === 'prescription' && user.role === 'pharmacy' && pharmacyId && f.request_id) {
    allowed = !!(await one('SELECT 1 FROM request_pharmacies WHERE request_id = $1 AND pharmacy_id = $2', [f.request_id, pharmacyId]));
  }
  if (!allowed && f.purpose === 'verification' && user.role === 'staff') {
    allowed = true;
    await pool.query('INSERT INTO audit_log (actor_user_id, action, target, reason) VALUES ($1,$2,$3,NULL)', [
      user.id,
      'view_verification_file',
      f.id,
    ]);
  }
  if (!allowed) throw notFound('File not found.');
  return f;
}

/** The pharmacy chosen for a request may list its prescription files; so may the patient. */
export async function pharmacyMayListRequestFiles(requestId: string, pharmacyId: string): Promise<boolean> {
  return !!(await one('SELECT 1 FROM request_pharmacies WHERE request_id = $1 AND pharmacy_id = $2', [requestId, pharmacyId]));
}

export async function deleteOwnFile(fileId: string, ownerId: string, purpose: 'prescription' | 'verification'): Promise<void> {
  const r = await pool.query('DELETE FROM private_files WHERE id = $1 AND owner_user_id = $2 AND purpose = $3', [fileId, ownerId, purpose]);
  if (!r.rowCount) throw notFound('File not found.');
}

/**
 * Deletes what is no longer needed: past its expiry, or a prescription whose request or order ended more than 48 hours ago,
 * and verification documents of an account that was deleted.
 */
export async function runFileCleanupJob(): Promise<{ deleted: number }> {
  const r = await pool.query(
    `DELETE FROM private_files f
      WHERE f.expires_at <= now()
         OR (f.purpose = 'prescription' AND EXISTS (
              SELECT 1 FROM requests r WHERE r.id = f.request_id AND r.status IN ('cancelled', 'expired') AND r.updated_at < now() - interval '48 hours'))
         OR (f.purpose = 'prescription' AND EXISTS (
              SELECT 1 FROM orders o WHERE o.request_id = f.request_id AND o.status IN ('delivered', 'cancelled') AND o.updated_at < now() - interval '48 hours'))
         OR EXISTS (SELECT 1 FROM users u WHERE u.id = f.owner_user_id AND u.deleted_at IS NOT NULL)`,
  );
  return { deleted: r.rowCount ?? 0 };
}
