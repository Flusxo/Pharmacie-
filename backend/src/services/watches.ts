import { one, pool, query } from '../db.js';
import { notFound } from '../errors.js';
import { notify } from '../notify.js';

/** How far from the patient's saved address a pharmacy counts as "nearby" for a stock alert. */
export const WATCH_RADIUS_KM = 30;

export async function followMedicine(patientId: string, medicineId: string): Promise<void> {
  const m = await one("SELECT 1 FROM medicines WHERE id = $1 AND deleted_at IS NULL AND status = 'approved'", [medicineId]);
  if (!m) throw notFound('This medicine does not exist.');
  await pool.query('INSERT INTO stock_watches (patient_id, medicine_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [patientId, medicineId]);
}

export async function unfollowMedicine(patientId: string, medicineId: string): Promise<void> {
  await pool.query('DELETE FROM stock_watches WHERE patient_id = $1 AND medicine_id = $2', [patientId, medicineId]);
}

export async function listFollowed(patientId: string) {
  return query(
    `SELECT w.medicine_id AS "medicineId", m.name, m.dosage, w.created_at AS "createdAt"
       FROM stock_watches w JOIN medicines m ON m.id = w.medicine_id
      WHERE w.patient_id = $1 ORDER BY w.created_at DESC`,
    [patientId],
  );
}

/**
 * Tells each patient once when a medicine they follow is in stock again at an eligible pharmacy near their address,
 * then stops following it. The notice is neutral (no medicine name) like every email subject; the link opens the page.
 */
export async function runStockWatchJob(): Promise<{ notified: number }> {
  const due = await query<{ patient_id: string; medicine_id: string }>(
    `SELECT w.patient_id, w.medicine_id
       FROM stock_watches w
       JOIN patients p ON p.user_id = w.patient_id AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
       JOIN users u ON u.id = w.patient_id AND u.deleted_at IS NULL
      WHERE EXISTS (
        SELECT 1 FROM eligible_pharmacies ep
          JOIN pharmacy_inventory i ON i.pharmacy_id = ep.user_id AND i.medicine_id = w.medicine_id AND i.quantity > 0
         WHERE haversine_km(p.latitude, p.longitude, ep.latitude, ep.longitude) <= $1)
      LIMIT 200`,
    [WATCH_RADIUS_KM],
  );
  for (const d of due) {
    await notify(
      d.patient_id,
      'stock_alert',
      'A medicine you follow is available again near you. Open it to see which pharmacy has it.',
      `/medicines/${d.medicine_id}`,
    );
    await pool.query('DELETE FROM stock_watches WHERE patient_id = $1 AND medicine_id = $2', [d.patient_id, d.medicine_id]);
  }
  return { notified: due.length };
}
