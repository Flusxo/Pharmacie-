import { one, pool, query } from '../db.js';
import { notify } from '../notify.js';

/**
 * Weekly summary for staff: the last 7 days next to the 7 days before. Counts and averages of the whole service only:
 * no name, no email, no medicine, no pharmacy. The page shows it; on Monday morning staff admins get a notice pointing to it
 * (and an email only if an email service is configured).
 */
export interface WeekNumbers {
  requests: number;
  delivered: number;
  acceptanceRate: number | null;
  avgResponseMinutes: number | null;
  newAccounts: Record<string, number>;
  reportsOpened: number;
  reportsResolved: number;
  reviews: number;
  reviewAverage: number | null;
  messages: number;
  filesUploaded: number;
}

async function week(from: string, to: string): Promise<WeekNumbers> {
  const p = [from, to];
  const n = async (sql: string) => (await one<{ n: number }>(sql, p))?.n ?? 0;
  const resp = await one<{ accepted: number; total: number; avg: number | null }>(
    `SELECT count(*) FILTER (WHERE response = 'accepted')::int AS accepted, count(*)::int AS total,
            round((avg(extract(epoch FROM responded_at - sent_at) / 60) FILTER (WHERE response = 'accepted'))::numeric, 1)::float AS avg
       FROM request_pharmacies WHERE response IN ('accepted', 'refused', 'expired') AND responded_at >= $1 AND responded_at < $2`,
    p,
  );
  const accounts = await query<{ role: string; n: number }>(
    'SELECT role, count(*)::int AS n FROM users WHERE created_at >= $1 AND created_at < $2 GROUP BY role',
    p,
  );
  const reviews = await one<{ n: number; avg: number | null }>(
    "SELECT count(*)::int AS n, round(avg(rating)::numeric, 1)::float AS avg FROM reviews WHERE created_at >= $1 AND created_at < $2 AND status = 'visible'",
    p,
  );
  return {
    requests: await n('SELECT count(*)::int AS n FROM requests WHERE created_at >= $1 AND created_at < $2'),
    delivered: await n("SELECT count(*)::int AS n FROM orders WHERE status = 'delivered' AND updated_at >= $1 AND updated_at < $2"),
    acceptanceRate: resp && resp.total ? Math.round((resp.accepted / resp.total) * 100) : null,
    avgResponseMinutes: resp?.avg ?? null,
    newAccounts: Object.fromEntries(accounts.map((a) => [a.role, a.n])),
    reportsOpened: await n('SELECT count(*)::int AS n FROM reports WHERE created_at >= $1 AND created_at < $2'),
    reportsResolved: await n(
      "SELECT count(*)::int AS n FROM audit_log WHERE action = 'resolve_report' AND created_at >= $1 AND created_at < $2",
    ),
    reviews: reviews?.n ?? 0,
    reviewAverage: reviews?.avg ?? null,
    messages: await n('SELECT count(*)::int AS n FROM order_messages WHERE created_at >= $1 AND created_at < $2'),
    filesUploaded: await n('SELECT count(*)::int AS n FROM private_files WHERE created_at >= $1 AND created_at < $2'),
  };
}

export async function weeklySummary(now = new Date()) {
  const day = 86_400_000;
  const end = new Date(now);
  const mid = new Date(end.getTime() - 7 * day);
  const start = new Date(end.getTime() - 14 * day);
  return {
    from: mid.toISOString(),
    to: end.toISOString(),
    current: await week(mid.toISOString(), end.toISOString()),
    previous: await week(start.toISOString(), mid.toISOString()),
  };
}

const TZ = 'Europe/Paris';
/** The ISO-like week key (year and week number) and weekday/hour in Paris, to send the summary once on Monday morning. */
function parisClock(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: String(p.weekday).toLowerCase().slice(0, 3), hour: Number(p.hour), date: `${p.year}-${p.month}-${p.day}` };
}

/** Monday from 08:00 (Paris): one notice to each staff admin, once per Monday. */
export async function runWeeklySummaryJob(now = new Date()): Promise<{ sent: number }> {
  const c = parisClock(now);
  if (c.weekday !== 'mon' || c.hour < 8) return { sent: 0 };
  const last = await one<{ value: { date?: string } }>("SELECT value FROM app_settings WHERE key = 'weekly_summary_last'");
  if (last?.value.date === c.date) return { sent: 0 };
  // Claim the Monday first, so two server instances cannot both send it.
  const claimed = await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('weekly_summary_last', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     WHERE app_settings.value->>'date' IS DISTINCT FROM $2`,
    [JSON.stringify({ date: c.date }), c.date],
  );
  if (!claimed.rowCount) return { sent: 0 };
  const admins = await query<{ user_id: string }>(
    `SELECT s.user_id FROM staff s JOIN users u ON u.id = s.user_id WHERE s.staff_role = 'admin' AND u.deleted_at IS NULL AND u.status = 'active'`,
  );
  for (const a of admins) {
    await notify(a.user_id, 'weekly_summary', 'Your weekly summary of the service is ready. Open the Statistics tab to read it.', '/admin');
  }
  return { sent: admins.length };
}
