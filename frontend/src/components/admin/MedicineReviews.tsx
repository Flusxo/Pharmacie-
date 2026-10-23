import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { formatDateTime } from '../../lib/format';
import { CardSkeleton, Empty, ErrorBox, RxBadge } from '../ui';

interface Candidate {
  id: string;
  name: string;
  dosage: string;
  form: string;
  cip13: string;
}
interface Proposal {
  id: string;
  cip13: string;
  name: string;
  activeSubstance: string;
  form: string;
  dosage: string;
  category: string;
  requiresPrescription: boolean;
  description: string;
  submittedAt: string;
  pharmacyName: string;
  pharmacyCity: string;
  similar: Candidate[];
}

/** Staff list of medicines proposed by pharmacies: approve (patients can then find it) or reject with a reason. */
export function MedicineReviews({ canModerate, onChanged }: { canModerate: boolean; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<{ items: Proposal[] }>('/admin/medicine-reviews', { query: { status: 'pending' } })
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [t]);
  useEffect(load, [load]);

  async function decide(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/admin/medicine-reviews/${id}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: approve ? {} : { reason: reasons[id] ?? '' },
      });
      toast(approve ? t('adm.reviews.approved') : t('adm.reviews.rejected'));
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  }

  if (!items && !error) return <CardSkeleton />;
  return (
    <div className="stack" data-testid="medicine-reviews">
      {error && <ErrorBox message={error} />}
      {items && items.length === 0 && <Empty>{t('adm.reviews.none')}</Empty>}
      {items?.map((p) => (
        <article key={p.id} className="card stack" data-testid="medicine-review">
          <div className="row between">
            <span className="stack" style={{ gap: 2 }}>
              <strong>
                {p.name} — {p.dosage}
              </strong>
              <span className="muted small">
                {p.activeSubstance} · {p.form} · {p.category} · CIP13 {p.cip13} <RxBadge rx={p.requiresPrescription} />
              </span>
              <span className="muted small">
                {t('adm.reviews.by', { pharmacy: p.pharmacyName, city: p.pharmacyCity })} · {formatDateTime(p.submittedAt, locale)}
              </span>
            </span>
          </div>
          {p.description && <p className="small">{p.description}</p>}
          {p.similar.length > 0 && (
            <div className="alert warn small" role="note">
              <strong>{t('adm.reviews.similar')}</strong>
              <ul className="plain-list">
                {p.similar.map((c) => (
                  <li key={c.id}>
                    {c.name} — {c.dosage} · {c.form} · {c.cip13}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canModerate && (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <button type="button" className="btn small" onClick={() => void decide(p.id, true)} data-testid="review-approve">
                {t('adm.approve')}
              </button>
              <input
                className="input"
                style={{ flex: 1, minWidth: 160 }}
                aria-label={t('adm.reviews.reason')}
                placeholder={t('adm.reviews.reason')}
                value={reasons[p.id] ?? ''}
                onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))}
              />
              <button
                type="button"
                className="btn secondary small"
                disabled={(reasons[p.id] ?? '').trim().length < 3}
                onClick={() => void decide(p.id, false)}
                data-testid="review-reject"
              >
                {t('adm.reject')}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
