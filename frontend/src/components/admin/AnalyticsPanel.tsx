import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { Kpi } from '../dash';
import { CardSkeleton, ErrorBox } from '../ui';

interface Counted {
  label: string;
  count: number;
}
interface Analytics {
  days: number;
  minGroup: number;
  kpis: {
    requests: number;
    orders: number;
    delivered: number;
    cancelled: number;
    acceptanceRate: number | null;
    avgResponseMinutes: number | null;
    newPatients: number;
    newPharmacies: number;
    activePharmacies: number;
    pendingMedicines: number;
  };
  perDay: { day: string; requests: number; delivered: number }[];
  ordersByStatus: Counted[];
  requestsByStatus: Counted[];
  topMedicines: Counted[];
  byCategory: Counted[];
  payments: { testMode: boolean; items: { label: string; count: number; cents: number }[] };
  pharmacies: { label: string; count: number; avgResponseMinutes: number | null }[];
}

/** Horizontal bars: label, bar, value. Works at any width. */
function Bars({ rows, tr }: { rows: Counted[]; tr?: (label: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hbar-label">{tr ? tr(r.label) : r.label}</span>
          <span className="hbar-track" aria-hidden="true">
            <span className="hbar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <strong className="hbar-value">{r.count}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Requests per day as an SVG bar chart (a table with the same numbers is one click away). */
function DayChart({ data, label }: { data: Analytics['perDay']; label: string }) {
  const { t } = useI18n();
  const W = 600;
  const H = 140;
  const max = Math.max(1, ...data.map((d) => d.requests));
  const bw = W / data.length;
  const total = data.reduce((s, d) => s + d.requests, 0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="day-chart" role="img" aria-label={`${label}: ${total}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = (d.requests / max) * H;
          return (
            <g key={d.day}>
              <rect x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={Math.max(h, 1)} rx={2} className="day-bar">
                <title>{`${d.day}: ${d.requests}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1="0" y1={H} x2={W} y2={H} className="day-axis" />
        <text x="0" y={H + 14} className="day-label">
          {data[0]?.day.slice(5)}
        </text>
        <text x={W} y={H + 14} textAnchor="end" className="day-label">
          {data.at(-1)?.day.slice(5)}
        </text>
      </svg>
      <details>
        <summary className="small">{t('adm.analytics.table')}</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adm.analytics.day')}</th>
                <th>{t('adm.analytics.requests')}</th>
                <th>{t('adm.analytics.delivered')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.requests}</td>
                  <td>{d.delivered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function AnalyticsPanel() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api<Analytics>('/admin/analytics', { query: { days } })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [days, t]);

  const tr = (label: string) => (label === 'other' ? t('adm.analytics.other') : label);
  const status = (label: string) => t(`status.${label}` as MessageKey);

  return (
    <div className="stack" style={{ gap: 16 }} data-testid="analytics">
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          {t('adm.analytics.privacy', { n: data?.minGroup ?? 3 })}
        </p>
        <select
          className="input"
          style={{ width: 'auto' }}
          aria-label={t('adm.analytics.period')}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>
              {t('adm.analytics.lastDays', { n: d })}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorBox message={error} />}
      {!data && !error && <CardSkeleton lines={4} />}
      {data && (
        <>
          <div className="grid cols-4">
            <Kpi label={t('adm.analytics.requests')} value={data.kpis.requests} />
            <Kpi label={t('adm.analytics.orders')} value={data.kpis.orders} />
            <Kpi label={t('adm.analytics.delivered')} value={data.kpis.delivered} tone="ok" />
            <Kpi label={t('adm.analytics.cancelled')} value={data.kpis.cancelled} tone={data.kpis.cancelled ? 'warn' : 'neutral'} />
            <Kpi label={t('adm.analytics.acceptance')} value={data.kpis.acceptanceRate != null ? `${data.kpis.acceptanceRate} %` : '—'} />
            <Kpi
              label={t('adm.kpiResponse')}
              value={data.kpis.avgResponseMinutes != null ? t('ph.minutes', { n: data.kpis.avgResponseMinutes }) : '—'}
            />
            <Kpi label={t('adm.analytics.newPatients')} value={data.kpis.newPatients} />
            <Kpi label={t('adm.analytics.activePharmacies')} value={data.kpis.activePharmacies} />
          </div>

          <section className="card stack" aria-labelledby="an-day">
            <h3 id="an-day" style={{ margin: 0 }}>
              {t('adm.analytics.perDay')}
            </h3>
            <DayChart data={data.perDay} label={t('adm.analytics.perDay')} />
          </section>

          <div className="grid cols-2">
            <section className="card stack" aria-labelledby="an-med">
              <h3 id="an-med" style={{ margin: 0 }}>
                {t('adm.analytics.topMedicines')}
              </h3>
              {data.topMedicines.length ? <Bars rows={data.topMedicines} tr={tr} /> : <p className="muted">{t('dash.empty')}</p>}
            </section>
            <section className="card stack" aria-labelledby="an-cat">
              <h3 id="an-cat" style={{ margin: 0 }}>
                {t('adm.analytics.categories')}
              </h3>
              {data.byCategory.length ? <Bars rows={data.byCategory} tr={tr} /> : <p className="muted">{t('dash.empty')}</p>}
            </section>
            <section className="card stack" aria-labelledby="an-ord">
              <h3 id="an-ord" style={{ margin: 0 }}>
                {t('adm.ordersChart')}
              </h3>
              {data.ordersByStatus.length ? <Bars rows={data.ordersByStatus} tr={status} /> : <p className="muted">{t('dash.empty')}</p>}
            </section>
            <section className="card stack" aria-labelledby="an-pay">
              <h3 id="an-pay" style={{ margin: 0 }}>
                {t('adm.analytics.payments')}
              </h3>
              <p className="muted small" style={{ margin: 0 }}>
                {t('adm.analytics.paymentsTest')}
              </p>
              {data.payments.items.length ? (
                <ul className="plain-list">
                  {data.payments.items.map((p) => (
                    <li key={p.label} className="row between">
                      <span>{t(`pay.status.${p.label}` as MessageKey)}</span>
                      <span>
                        {p.count} · {formatPrice(p.cents / 100, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{t('dash.empty')}</p>
              )}
            </section>
          </div>

          <section className="card stack" aria-labelledby="an-ph">
            <h3 id="an-ph" style={{ margin: 0 }}>
              {t('adm.analytics.pharmacies')}
            </h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('adm.analytics.pharmacy')}</th>
                    <th>{t('adm.analytics.accepted')}</th>
                    <th>{t('adm.kpiResponse')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pharmacies.map((p) => (
                    <tr key={p.label}>
                      <td>{p.label}</td>
                      <td>{p.count}</td>
                      <td>{p.avgResponseMinutes != null ? t('ph.minutes', { n: p.avgResponseMinutes }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
