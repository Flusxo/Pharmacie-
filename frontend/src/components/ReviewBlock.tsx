import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useToast } from '../lib/toast';
import { ErrorBox } from './ui';

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}
export interface ReviewSummary {
  count: number;
  average: number | null;
  items: ReviewItem[];
}

export function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span role="img" aria-label={label} style={{ letterSpacing: 2, color: 'var(--warn, #b45309)' }}>
      {'★'.repeat(Math.round(value))}
      <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}

/** The patient's review of a delivered order: a form once, then what they wrote. */
export function ReviewForm({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [done, setDone] = useState<{ rating: number; comment: string | null; status: string } | null | undefined>(undefined);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ review: { rating: number; comment: string | null; status: string } | null }>(`/patient/orders/${orderId}/review`)
      .then((r) => setDone(r.review))
      .catch(() => setDone(null));
  }, [orderId]);
  if (done === undefined) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/patient/orders/${orderId}/review`, { method: 'POST', body: { rating, comment: comment || null } });
      toast(t('review.thanks'));
      setDone({ rating, comment: comment || null, status: 'visible' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };
  return (
    <section className="card stack" aria-labelledby="review-h" data-testid="review-block">
      <h2 id="review-h">{t('review.title')}</h2>
      {done ? (
        <p style={{ margin: 0 }}>
          <Stars value={done.rating} label={t('review.stars', { n: done.rating })} /> {done.comment}
        </p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted small" style={{ margin: 0 }}>
            {t('review.help')}
          </p>
          {error && <ErrorBox message={error} />}
          <fieldset className="row" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
            <legend className="sr-only">{t('review.rating')}</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="check">
                <input type="radio" name="rating" checked={rating === n} onChange={() => setRating(n)} />
                <span>{n}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>{t('review.comment')}</span>
            <textarea className="input" rows={3} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button className="btn" type="submit" style={{ width: 'fit-content' }}>
            {t('review.send')}
          </button>
        </form>
      )}
    </section>
  );
}

/** Average and latest visible reviews (public page). `reportable` shows a report button (pharmacy dashboard). */
export function ReviewList({ path, reportPath }: { path: string; reportPath?: (id: string) => string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<ReviewSummary | null>(null);
  const load = useCallback(
    () =>
      api<ReviewSummary>(path)
        .then(setData)
        .catch(() => setData({ count: 0, average: null, items: [] })),
    [path],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return null;
  return (
    <section className="card stack" aria-labelledby="reviews-h" data-testid="reviews">
      <h2 id="reviews-h">{t('review.listTitle')}</h2>
      {data.count === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('review.none')}
        </p>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            <strong>{data.average}</strong> / 5 <Stars value={data.average ?? 0} label={t('review.stars', { n: data.average ?? 0 })} />{' '}
            <span className="muted small">{t('review.count', { n: data.count })}</span>
          </p>
          {data.items.map((r) => (
            <div key={r.id} className="stack" style={{ gap: 2 }} data-testid="review">
              <span>
                <Stars value={r.rating} label={t('review.stars', { n: r.rating })} />{' '}
                <span className="muted small">{formatDate(r.createdAt, locale)}</span>
              </span>
              {r.comment && <span>{r.comment}</span>}
              {reportPath && (
                <button
                  type="button"
                  className="link-btn small"
                  style={{ width: 'fit-content' }}
                  onClick={() => {
                    const reason = window.prompt(t('review.reportPrompt'));
                    if (reason && reason.trim().length >= 3)
                      void api(reportPath(r.id), { method: 'POST', body: { reason } }).then(() => toast(t('review.reported')));
                  }}
                >
                  {t('review.report')}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
