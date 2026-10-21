import { RULES } from '../config.js';
import { query, tx } from '../db.js';
import { notify } from '../notify.js';

/**
 * Scheduled job.
 * 1. A chosen pharmacy that has not answered within the response window: its turn expires and the
 *    request returns to `received` so the patient can choose another pharmacy.
 * 2. A request with no accepted pharmacy after REQUEST_EXPIRY_HOURS becomes `expired`.
 */
export async function runExpiryJob(): Promise<{ windowsExpired: number; requestsExpired: number }> {
  const windows = await tx(async (c) => {
    const rows = await query<{ request_id: string; patient_id: string }>(
      `UPDATE request_pharmacies rp SET response = 'expired', responded_at = now()
         FROM requests r
        WHERE r.id = rp.request_id AND rp.response = 'pending' AND r.status = 'sent_to_pharmacy'
          AND rp.sent_at < now() - make_interval(mins => $1)
        RETURNING rp.request_id, r.patient_id`,
      [RULES.PHARMACY_RESPONSE_MINUTES],
      c,
    );
    for (const r of rows) {
      await c.query(`UPDATE requests SET status = 'received', updated_at = now() WHERE id = $1 AND status = 'sent_to_pharmacy'`, [
        r.request_id,
      ]);
      await c.query('UPDATE request_items SET excluded = false WHERE request_id = $1', [r.request_id]);
      await notify(
        r.patient_id,
        'request_refused',
        'The pharmacy did not answer in time. Please choose another pharmacy.',
        `/requests/${r.request_id}`,
        c,
      );
    }
    return rows.length;
  });

  const expired = await tx(async (c) => {
    const rows = await query<{ id: string; patient_id: string }>(
      `UPDATE requests SET status = 'expired', updated_at = now()
        WHERE status IN ('received', 'sent_to_pharmacy', 'awaiting_patient_approval')
          AND created_at < now() - make_interval(hours => $1)
        RETURNING id, patient_id`,
      [RULES.REQUEST_EXPIRY_HOURS],
      c,
    );
    for (const r of rows) {
      await c.query(
        `UPDATE request_pharmacies SET response = 'expired', responded_at = now() WHERE request_id = $1 AND response = 'pending'`,
        [r.id],
      );
      await notify(
        r.patient_id,
        'request_expired',
        'Your request expired because no pharmacy accepted it within 24 hours.',
        `/requests/${r.id}`,
        c,
      );
    }
    return rows.length;
  });

  return { windowsExpired: windows, requestsExpired: expired };
}
