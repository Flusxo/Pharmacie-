import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { duration, easeOut, stagger } from '../../motion';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/fr';
import { ApiError, api } from '../../lib/api';
import { usePlace } from '../../lib/location';
import type { Medicine } from '../../lib/types';
import { PackImage } from '../../components/PackImage';
import { SearchBox } from '../../components/SearchBox';
import { LocationControl } from '../../components/LocationControl';
import { CardSkeleton, Empty, ErrorBox, RxBadge } from '../../components/ui';

interface SearchResult {
  items: Medicine[];
  total: number;
  page: number;
  pages: number;
  didYouMean: string | null;
}

export function AvailabilityText({ n }: { n: number | undefined }) {
  const { t } = useI18n();
  if (!n) return <span className="badge neutral">{t('search.notNearby')}</span>;
  // Pulses once when the data arrives.
  return <span className="badge ok pulse-once">{n === 1 ? t('search.inStockAtOne') : t('search.inStockAt', { n })}</span>;
}

export function MedicineCard({ m }: { m: Medicine }) {
  const { t } = useI18n();
  return (
    <Link to={`/medicines/${m.id}`} className="card lift med-card" data-testid="medicine-card">
      <PackImage name={m.name} dosage={m.dosage} form={m.form} category={m.category} imageUrl={m.imageUrl} rx={m.requiresPrescription} />
      <div className="stack" style={{ gap: 6 }}>
        <h3>{m.name}</h3>
        <span className="muted small">
          {m.dosage} · {t(`form.${m.form}` as MessageKey)}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <AvailabilityText n={m.availableAt} />
          <RxBadge rx={m.requiresPrescription} />
        </div>
        {m.ageNote && <span className="muted small">{m.ageNote}</span>}
      </div>
    </Link>
  );
}

export function SearchPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const { place } = usePlace();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<{ items: { category: string; count: number }[] }>('/medicines/categories')
      .then((r) => setCategories(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    api<SearchResult>('/medicines', { query: { q, category, page, lat: place.lat, lon: place.lon, radiusKm: 30 }, signal: ctrl.signal })
      .then(setData)
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(e instanceof ApiError ? e.message : t('common.error'));
      });
    return () => ctrl.abort();
  }, [q, category, page, place.lat, place.lon, reload, t]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1>{t('search.title')}</h1>
      <SearchBox initial={q} onSubmit={(v) => update({ q: v })} />
      <div className="row between">
        <LocationControl compact />
        <label className="row" style={{ gap: 8 }}>
          <span className="sr-only">{t('home.categories')}</span>
          <select className="input" style={{ width: 'auto' }} value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">{t('search.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {t(`cat.${c.category}` as MessageKey)} ({c.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <ErrorBox message={error} onRetry={() => setReload((r) => r + 1)} />}
      {!data && !error && (
        <div className="grid cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {data && (
        <>
          <p className="muted" aria-live="polite">
            {t('search.results', { n: data.total })}
          </p>
          {data.items.length === 0 ? (
            <Empty>
              <p>{t('search.noResults')}</p>
              {data.didYouMean && (
                <p>
                  {t('search.didYouMean')}{' '}
                  <button type="button" className="btn ghost small" onClick={() => update({ q: data.didYouMean! })}>
                    {data.didYouMean}
                  </button>{' '}
                  ?
                </p>
              )}
            </Empty>
          ) : (
            <motion.div className="grid cols-2" layout>
              <AnimatePresence mode="popLayout" initial={false}>
                {data.items.map((m, i) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: easeOut, delay: Math.min(i, 10) * stagger } }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: duration.fast } }}
                  >
                    <MedicineCard m={m} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
          {data.pages > 1 && (
            <nav className="row" style={{ justifyContent: 'center' }} aria-label="Pagination">
              <button type="button" className="btn secondary small" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                {t('search.prev')}
              </button>
              <span className="muted small">{t('search.page', { page, pages: data.pages })}</span>
              <button
                type="button"
                className="btn secondary small"
                disabled={page >= data.pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                {t('search.next')}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
