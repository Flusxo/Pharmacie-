import { one, pool, query } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { notify } from '../notify.js';
import { createRequest } from './requests.js';

/**
 * Refill reminders: "remind me in N days to renew this medicine". The reminder is a date and nothing else: it never says
 * how much or how often to take anything. The notice sends the person back to a pharmacist or doctor if unsure.
 */
export const REMINDER_DAYS = [7, 14, 30, 60, 90] as const;
export const MAX_REMINDERS = 20;

export async function createReminder(patientId: string, medicineId: string, days: number) {
  // Only for a medicine this person already asked for (the reminder follows a real request, never a guess).
  const before = await one<{ for_member_id: string | null }>(
    `SELECT r.for_member_id FROM requests r JOIN request_items ri ON ri.request_id = r.id
      WHERE r.patient_id = $1 AND ri.medicine_id = $2 ORDER BY r.created_at DESC LIMIT 1`,
    [patientId, medicineId],
  );
  if (!before) throw notFound('You have not requested this medicine before.');
  await pool.query('DELETE FROM refill_reminders WHERE patient_id = $1 AND medicine_id = $2 AND sent_at IS NULL', [patientId, medicineId]);
  const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM refill_reminders WHERE patient_id = $1 AND sent_at IS NULL', [
    patientId,
  ]);
  if ((n?.n ?? 0) >= MAX_REMINDERS) throw conflict('You can have at most 20 reminders.', 'too_many_reminders');
  const r = await one<{ id: string; remind_at: string }>(
    `INSERT INTO refill_reminders (patient_id, medicine_id, for_member_id, remind_at)
     VALUES ($1,$2,$3, now() + make_interval(days => $4)) RETURNING id, remind_at`,
    [patientId, medicineId, before.for_member_id, days],
  );
  return { id: r!.id, remindAt: r!.remind_at };
}

export const listReminders = (patientId: string) =>
  query(
    `SELECT rr.id, rr.remind_at AS "remindAt", m.id AS "medicineId", m.name, m.dosage,
            (SELECT json_build_object('firstName', fm.first_name, 'relation', fm.relation) FROM family_members fm WHERE fm.id = rr.for_member_id) AS "forMember"
       FROM refill_reminders rr JOIN medicines m ON m.id = rr.medicine_id
      WHERE rr.patient_id = $1 AND rr.sent_at IS NULL ORDER BY rr.remind_at`,
    [patientId],
  );

export async function deleteReminder(patientId: string, id: string): Promise<void> {
  const r = await pool.query('DELETE FROM refill_reminders WHERE id = $1 AND patient_id = $2 AND sent_at IS NULL', [id, patientId]);
  if (!r.rowCount) throw notFound('Reminder not found.');
}

/** Sends each due reminder once. The notice names no medicine; its link opens the medicine page. */
export async function runRefillJob(): Promise<{ sent: number }> {
  const due = await query<{ id: string; patient_id: string; medicine_id: string }>(
    `SELECT rr.id, rr.patient_id, rr.medicine_id FROM refill_reminders rr
       JOIN users u ON u.id = rr.patient_id AND u.deleted_at IS NULL
      WHERE rr.sent_at IS NULL AND rr.remind_at <= now() ORDER BY rr.remind_at LIMIT 200`,
  );
  for (const d of due) {
    await pool.query('UPDATE refill_reminders SET sent_at = now() WHERE id = $1 AND sent_at IS NULL', [d.id]);
    await notify(
      d.patient_id,
      'refill',
      'It may be time to renew a medicine you asked for. Open it to request it again, and ask a pharmacist or your doctor if you are unsure.',
      `/medicines/${d.medicine_id}`,
    );
  }
  return { sent: due.length };
}

/** A new request with the same medicines, quantities, note and person as one of this patient's earlier requests. */
export async function repeatRequest(patientId: string, requestId: string) {
  const r = await one<{ prescription_note: string | null; for_member_id: string | null; source: string }>(
    'SELECT prescription_note, for_member_id, source FROM requests WHERE id = $1 AND patient_id = $2',
    [requestId, patientId],
  );
  if (!r) throw notFound('Request not found.');
  const items = await query<{ medicineId: string; quantity: number }>(
    'SELECT medicine_id AS "medicineId", quantity FROM request_items WHERE request_id = $1',
    [requestId],
  );
  // A person who was removed from the family list is no longer a choice: the repeat is for the account holder then.
  const member =
    r.for_member_id && (await one('SELECT 1 FROM family_members WHERE id = $1 AND deleted_at IS NULL', [r.for_member_id]))
      ? r.for_member_id
      : null;
  return createRequest({ patientId, items, prescriptionNote: r.prescription_note, forMemberId: member });
}
