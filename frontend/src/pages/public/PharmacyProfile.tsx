import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import type { OpeningHours } from '../../lib/types';
import { CardSkeleton, ErrorBox, OpenBadge } from '../../components/ui';
import { SaveButton } from '../../components/SaveButton';
import { useAuth } from '../../lib/auth';
import { ReviewList } from '../../components/ReviewBlock';

interface Profile {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  openingHours: OpeningHours;
  onDuty: string[];
  services: string[];
  languages: string[];
  accessibility: string[];
  verified: boolean;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function Chips({ title, codes, prefix }: { title: string; codes: string[]; prefix: string }) {
  const { t } = useI18n();
  return (
    <section className="stack" style={{ gap: 6 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {codes.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {t('pp.notProvided')}
        </p>
      ) : (
        <ul className="row" style={{ gap: 8, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          {codes.map((c) => (
            <li key={c} className="badge neutral">
              {t(`${prefix}.${c}` as MessageKey)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Public page of one pharmacy: where, when, what it offers. Reached from the pharmacy lists. */
export function PharmacyProfilePage() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ pharmacy: Profile }>(`/pharmacies/${id}`)
      .then((r) => setP(r.pharmacy))
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [id, t]);
  if (error) return <ErrorBox message={error} />;
  if (!p) return <CardSkeleton lines={6} />;
  const dayName = (i: number) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'long' });
  return (
    <div
      className="pub-page stack"
      style={{ gap: 20, maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}
      data-testid="pharmacy-profile"
    >
      <Link to={user ? '/map' : '/pharmacies'} className="small">
        ← {t('common.back')}
      </Link>
      <header className="card row between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ margin: 0 }}>{p.name}</h1>
          <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {p.verified && <span className="badge info">{t('med.verifiedByStaff')}</span>}
            <OpenBadge hours={p.openingHours} onDuty={p.onDuty} />
          </span>
        </div>
        {user?.role === 'patient' && <SaveButton pharmacyId={p.id} name={p.name} />}
      </header>
      <section className="card stack" aria-labelledby="pp-where">
        <h2 id="pp-where">{t('pp.where')}</h2>
        <p style={{ margin: 0 }}>
          {p.address}
          {p.phone && (
            <>
              <br />
              <a href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a>
            </>
          )}
        </p>
      </section>
      <section className="card stack" aria-labelledby="pp-hours">
        <h2 id="pp-hours">{t('pp.hours')}</h2>
        <table className="table hours-table">
          <tbody>
            {DAYS.map((d, i) => (
              <tr key={d}>
                <th scope="row" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                  {dayName(i)}
                  {p.onDuty.includes(d) && (
                    <span className="badge ok" style={{ marginLeft: 8 }}>
                      {t('hours.onDuty')}
                    </span>
                  )}
                </th>
                <td>
                  {(p.openingHours[d] ?? []).length
                    ? (p.openingHours[d] ?? []).map(([a, b]) => `${a}–${b}`).join(' · ')
                    : t('hours.closed')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card stack">
        <Chips title={t('pp.services')} codes={p.services} prefix="pp.service" />
        <Chips title={t('pp.languages')} codes={p.languages} prefix="pp.lang" />
        <Chips title={t('pp.accessibility')} codes={p.accessibility} prefix="pp.access" />
      </section>
      <ReviewList path={`/pharmacies/${p.id}/reviews`} />
      <p className="alert info small" role="note">
        {t('pp.note')}
      </p>
    </div>
  );
}
