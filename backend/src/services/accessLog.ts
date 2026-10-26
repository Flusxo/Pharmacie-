import { pool, query } from '../db.js';
import { log } from '../logger.js';

/**
 * "Who looked at my data": every time someone other than the patient opens the patient's data, one row is written (one per
 * viewer, kind and item per hour, so a list that refreshes every 15 seconds does not fill the log). The patient reads it in
 * plain words on the account page. Only the viewer's public label is kept ("Pharmacie du Rhône", "Dr Martin"); staff are
 * shown only as "the counter. team". Rows are kept 12 months.
 */
export type AccessKind = 'request' | 'order' | 'prescription' | 'doctor' | 'staff';
export type Viewer = { role: 'pharmacy'; userId: string } | { role: 'doctor'; userId: string } | { role: 'staff'; userId: string };

const LABEL = `CASE $2::text
    WHEN 'pharmacy' THEN coalesce((SELECT name FROM pharmacies WHERE user_id = $1), 'Pharmacy')
    WHEN 'doctor' THEN coalesce((SELECT 'Dr ' || last_name FROM doctors WHERE user_id = $1), 'Doctor')
    ELSE 'staff' END`;

const SOURCES = {
  requests: { patient: 'r.patient_id', ref: 'r.id::text', from: 'requests r WHERE r.id = ANY($4::uuid[])' },
  orders: { patient: 'o.patient_id', ref: 'o.id::text', from: 'orders o WHERE o.id = ANY($4::uuid[])' },
  patients: { patient: 'p.user_id', ref: "''", from: 'patients p WHERE p.user_id = ANY($4::uuid[])' },
} as const;

async function insert(kind: AccessKind, v: Viewer, source: keyof typeof SOURCES, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const src = SOURCES[source];
  try {
    await pool.query(
      `INSERT INTO access_log (patient_id, viewer_user_id, viewer_role, viewer_label, kind, ref, bucket)
       SELECT ${src.patient}, $1::uuid, $2::text, ${LABEL}, $3::text, ${src.ref}, date_trunc('hour', now())
         FROM ${src.from}
       ON CONFLICT DO NOTHING`,
      [v.userId, v.role, kind, ids],
    );
  } catch (err) {
    // The log must never break the screen it describes.
    log('error', 'access_log_failed', { err: (err as Error).message });
  }
}

/** The viewer opened these requests (the people who made them are told). */
export const logRequestViews = (kind: AccessKind, v: Viewer, requestIds: string[]) => insert(kind, v, 'requests', requestIds);
/** The viewer opened these orders. */
export const logOrderViews = (kind: AccessKind, v: Viewer, orderIds: string[]) => insert(kind, v, 'orders', orderIds);
/** The viewer opened these patients' details directly (a doctor with a confirmed link, staff in the staff area). */
export const logPatientViews = (kind: AccessKind, v: Viewer, patientIds: string[]) => insert(kind, v, 'patients', patientIds);

/** The patient's own view: newest first, last 12 months. The viewer's account id is never sent. */
export const listAccessLog = (patientId: string) =>
  query<{ id: number; when: string; kind: AccessKind; role: string; label: string }>(
    `SELECT id, created_at AS "when", kind, viewer_role AS role, CASE WHEN viewer_role = 'staff' THEN '' ELSE viewer_label END AS label
       FROM access_log WHERE patient_id = $1 AND created_at > now() - interval '12 months' ORDER BY id DESC LIMIT 200`,
    [patientId],
  );

export async function runAccessLogCleanup(): Promise<{ deleted: number }> {
  const r = await pool.query("DELETE FROM access_log WHERE created_at < now() - interval '12 months'");
  return { deleted: r.rowCount ?? 0 };
}
