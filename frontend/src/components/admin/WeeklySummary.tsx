import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';

interface Numbers {
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
interface Summary {
  from: string;
  to: string;
  current: Numbers;
  previous: Numbers;
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

function Delta({ now, before }: { now: number | null; before: number | null }) {
  const { t } = useI18n();
  if (now === null || before === null) return <span className="muted">—</span>;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="muted">{t('week.same')}</span>;
  return (
    <span aria-label={t(d > 0 ? 'week.up' : 'week.down', { n: Math.abs(d) })}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)}
    </span>
  );
}

/** Staff: the last 7 days next to the 7 days before. Whole-service numbers only. */
export function WeeklySummary() {
  const { t, locale } = useI18n();
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/admin/weekly-summary')
      .then(setS)
      .catch(() => setS(null));
  }, []);
  if (!s) return null;
  const c = s.current;
  const p = s.previous;
  const rows: [string, number | null, number | null, string?][] = [
    [t('week.requests'), c.requests, p.requests],
    [t('week.delivered'), c.delivered, p.delivered],
    [t('week.acceptance'), c.acceptanceRate, p.acceptanceRate, '%'],
    [t('week.response'), c.avgResponseMinutes, p.avgResponseMinutes, ' min'],
    [t('week.accounts'), sum(c.newAccounts), sum(p.newAccounts)],
    [t('week.reportsOpened'), c.reportsOpened, p.reportsOpened],
    [t('week.reportsResolved'), c.reportsResolved, p.reportsResolved],
    [t('week.reviews'), c.reviews, p.reviews],
    [t('week.messages'), c.messages, p.messages],
    [t('week.files'), c.filesUploaded, p.filesUploaded],
  ];
  return (
    <section className="card stack" aria-labelledby="week-h" data-testid="weekly-summary">
      <h2 id="week-h">{t('week.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('week.range', { from: formatDate(s.from, locale), to: formatDate(s.to, locale) })} · {t('week.privacy')}
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('week.metric')}</th>
              <th>{t('week.thisWeek')}</th>
              <th>{t('week.lastWeek')}</th>
              <th>{t('week.change')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, now, before, unit]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{now === null ? '—' : `${now}${unit ?? ''}`}</td>
                <td>{before === null ? '—' : `${before}${unit ?? ''}`}</td>
                <td>
                  <Delta now={now} before={before} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
