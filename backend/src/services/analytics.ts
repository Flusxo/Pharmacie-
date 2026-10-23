/**
 * Admin analytics: aggregated numbers only. No names, e-mails, addresses or free text of patients, doctors or
 * pharmacy staff ever leave this module. Small groups (fewer than MIN_GROUP) are folded into "other" so that a
 * single person cannot be recognised from a chart.
 */
import { query } from '../db.js';

export const MIN_GROUP = 3;

interface Counted {
  label: string;
  count: number;
}

/** Keeps groups of at least MIN_GROUP and folds the rest into one "other" line. */
export function foldSmallGroups(rows: Counted[], other = 'other'): Counted[] {
  const kept = rows.filter((r) => r.count >= MIN_GROUP);
  const rest = rows.filter((r) => r.count < MIN_GROUP).reduce((s, r) => s + r.count, 0);
  return rest >= MIN_GROUP ? [...kept, { label: other, count: rest }] : kept;
}

export async function analytics(days: number) {
  const since = `now() - make_interval(days => $1)`;

  const [kpi] = await query<Record<string, number | null>>(
    `SELECT
       (SELECT count(*) FROM requests WHERE created_at >= ${since})::int AS requests,
       (SELECT count(*) FROM orders WHERE created_at >= ${since})::int AS orders,
       (SELECT count(*) FROM orders WHERE created_at >= ${since} AND status = 'delivered')::int AS delivered,
       (SELECT count(*) FROM orders WHERE created_at >= ${since} AND status = 'cancelled')::int AS cancelled,
       (SELECT count(*) FROM request_pharmacies WHERE sent_at >= ${since} AND response = 'accepted')::int AS accepted,
       (SELECT count(*) FROM request_pharmacies WHERE sent_at >= ${since} AND response IN ('refused', 'expired'))::int AS declined,
       (SELECT round(avg(extract(epoch FROM responded_at - sent_at) / 60)::numeric, 1)::float FROM request_pharmacies
         WHERE sent_at >= ${since} AND response IN ('accepted', 'refused')) AS "avgResponseMinutes",
       (SELECT count(*) FROM users WHERE created_at >= ${since} AND deleted_at IS NULL AND role = 'patient')::int AS "newPatients",
       (SELECT count(*) FROM users WHERE created_at >= ${since} AND deleted_at IS NULL AND role = 'pharmacy')::int AS "newPharmacies",
       (SELECT count(DISTINCT pharmacy_id) FROM request_pharmacies WHERE sent_at >= ${since})::int AS "activePharmacies",
       (SELECT count(*) FROM medicines WHERE status = 'pending' AND deleted_at IS NULL)::int AS "pendingMedicines"`,
    [days],
  );

  const perDay = await query<{ day: string; requests: number; delivered: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            (SELECT count(*) FROM requests r WHERE (r.created_at AT TIME ZONE 'Europe/Paris')::date = d)::int AS requests,
            (SELECT count(*) FROM orders o WHERE o.status = 'delivered' AND (o.updated_at AT TIME ZONE 'Europe/Paris')::date = d)::int AS delivered
       FROM generate_series(((now() AT TIME ZONE 'Europe/Paris')::date - ($1::int - 1)), (now() AT TIME ZONE 'Europe/Paris')::date, interval '1 day') AS g(d)
      ORDER BY d`,
    [days],
  );

  const ordersByStatus = await query<Counted>(
    `SELECT status::text AS label, count(*)::int AS count FROM orders WHERE created_at >= ${since} GROUP BY status ORDER BY count DESC`,
    [days],
  );
  const requestsByStatus = await query<Counted>(
    `SELECT status::text AS label, count(*)::int AS count FROM requests WHERE created_at >= ${since} GROUP BY status ORDER BY count DESC`,
    [days],
  );
  const topMedicines = await query<Counted>(
    `SELECT m.name AS label, sum(ri.quantity)::int AS count
       FROM request_items ri JOIN requests r ON r.id = ri.request_id JOIN medicines m ON m.id = ri.medicine_id
      WHERE r.created_at >= ${since} AND NOT ri.excluded GROUP BY m.name ORDER BY count DESC, m.name LIMIT 30`,
    [days],
  );
  const byCategory = await query<Counted>(
    `SELECT m.category AS label, sum(ri.quantity)::int AS count
       FROM request_items ri JOIN requests r ON r.id = ri.request_id JOIN medicines m ON m.id = ri.medicine_id
      WHERE r.created_at >= ${since} AND NOT ri.excluded GROUP BY m.category ORDER BY count DESC, m.category`,
    [days],
  );
  const payments = await query<{ label: string; count: number; cents: number }>(
    `SELECT p.status AS label, count(*)::int AS count, coalesce(sum(p.amount_cents), 0)::int AS cents
       FROM payments p WHERE p.created_at >= ${since} GROUP BY p.status ORDER BY count DESC`,
    [days],
  );
  const pharmacies = await query<{ label: string; count: number; avgResponseMinutes: number | null }>(
    `SELECT ph.name AS label, count(*) FILTER (WHERE rp.response = 'accepted')::int AS count,
            round(avg(extract(epoch FROM rp.responded_at - rp.sent_at) / 60) FILTER (WHERE rp.response IN ('accepted', 'refused'))::numeric, 1)::float
              AS "avgResponseMinutes"
       FROM request_pharmacies rp JOIN pharmacies ph ON ph.user_id = rp.pharmacy_id
      WHERE rp.sent_at >= ${since} GROUP BY ph.name ORDER BY count DESC, ph.name LIMIT 8`,
    [days],
  );

  const decided = (kpi.accepted ?? 0) + (kpi.declined ?? 0);
  return {
    days,
    generatedAt: new Date().toISOString(),
    minGroup: MIN_GROUP,
    kpis: { ...kpi, acceptanceRate: decided ? Math.round(((kpi.accepted ?? 0) / decided) * 100) : null },
    perDay,
    ordersByStatus,
    requestsByStatus,
    topMedicines: foldSmallGroups(topMedicines.slice(0, 10)),
    byCategory: foldSmallGroups(byCategory),
    payments: { testMode: true, items: payments },
    pharmacies,
  };
}
