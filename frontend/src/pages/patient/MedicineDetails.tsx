import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { usePlace } from '../../lib/location';
import { formatKm, formatPrice, openState } from '../../lib/format';
import type { Medicine, NearbyPharmacy } from '../../lib/types';
import { ProductVisual } from '../../components/three/ThreeVisuals';
import { RequestSheet } from '../../components/RequestSheet';
import { LazyMap } from '../../components/map/LazyMap';
import { LocationControl } from '../../components/LocationControl';
import { SaveButton } from '../../components/SaveButton';
import { FollowButton } from '../../components/FollowButton';
import { useSavedPharmacies } from '../../lib/saved';
import { CardSkeleton, Empty, ErrorBox, OpenBadge, RxBadge } from '../../components/ui';
import { AvailabilityText, MedicineCard } from './Search';
import { medicineText } from '../../lib/medicine';

export function MedicineDetailsPage() {
  const { id = '' } = useParams();
  const { t, locale, lang } = useI18n();
  const { place } = usePlace();
  const [data, setData] = useState<{ medicine: Medicine; generics: Medicine[] } | null>(null);
  const [pharmacies, setPharmacies] = useState<NearbyPharmacy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ pharmacyId: string | null } | null>(null);
  const { isSaved, saved } = useSavedPharmacies();
  const [savedOnly, setSavedOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [stockOnly, setStockOnly] = useState(false);
  const [maxKm, setMaxKm] = useState(0);
  const [sortBy, setSortBy] = useState<'distance' | 'price'>('distance');

  useEffect(() => {
    setData(null);
    setError(null);
    api<{ medicine: Medicine; generics: Medicine[] }>(`/medicines/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [id, t]);

  useEffect(() => {
    setPharmacies(null);
    api<{ items: NearbyPharmacy[] }>(`/medicines/${id}/pharmacies`, { query: { lat: place.lat, lon: place.lon, radiusKm: 30 } })
      .then((r) => setPharmacies(r.items))
      .catch(() => setPharmacies([]));
  }, [id, place.lat, place.lon]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <CardSkeleton lines={6} />;
  const m = data.medicine;
  const anyInStock = (pharmacies ?? []).some((p) => p.inStock);
  const filtered = (pharmacies ?? [])
    .filter(
      (p) =>
        (!openOnly || openState(p.openingHours, p.onDuty).kind !== 'closed') &&
        (!stockOnly || p.inStock) &&
        (!savedOnly || isSaved(p.id)) &&
        (!maxKm || p.distanceKm <= maxKm),
    )
    .sort((a, b) => (sortBy === 'price' ? (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity) : a.distanceKm - b.distanceKm));
  // "Cheapest nearby": the lowest price among the pharmacies that have it in stock (needs at least two prices to compare).
  const priced = (pharmacies ?? []).filter((p) => p.inStock && p.priceEur != null).map((p) => p.priceEur as number);
  const cheapest = priced.length >= 2 ? Math.min(...priced) : null;
  const filtering = openOnly || stockOnly || savedOnly || maxKm > 0;
  const resetFilters = () => {
    setOpenOnly(false);
    setStockOnly(false);
    setSavedOnly(false);
    setMaxKm(0);
  };

  return (
    <div className="stack" style={{ gap: 28 }}>
      <Link to="/search" className="small">
        ← {t('common.back')}
      </Link>
      <div className="details">
        <ProductVisual
          name={m.name}
          dosage={m.dosage}
          form={m.form}
          category={m.category}
          cip13={m.cip13}
          imageUrl={m.imageUrl}
          requiresPrescription={m.requiresPrescription}
        />
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <span className="badge neutral">{t(`cat.${m.category}` as MessageKey)}</span>
            <RxBadge rx={m.requiresPrescription} />
            {!m.requiresPrescription && <span className="badge ok">{t('common.noPrescription')}</span>}
          </div>
          <h1 style={{ marginBottom: 0 }}>{m.name}</h1>
          <p className="muted" style={{ fontSize: '1.05rem' }}>
            {medicineText(m, lang).description}
          </p>
          <dl className="grid cols-2" style={{ margin: 0 }}>
            <div>
              <dt className="muted small">{t('med.substance')}</dt>
              <dd style={{ margin: 0 }}>{m.activeSubstance}</dd>
            </div>
            <div>
              <dt className="muted small">{t('med.form')}</dt>
              <dd style={{ margin: 0 }}>{t(`form.${m.form}` as MessageKey)}</dd>
            </div>
            <div>
              <dt className="muted small">{t('med.dosage')}</dt>
              <dd style={{ margin: 0 }}>{m.dosage}</dd>
            </div>
            <div>
              <dt className="muted small">{t('med.age')}</dt>
              <dd style={{ margin: 0 }}>{medicineText(m, lang).ageNote}</dd>
            </div>
            <div>
              <dt className="muted small">{t('med.cip')}</dt>
              <dd style={{ margin: 0 }}>{m.cip13}</dd>
            </div>
          </dl>
          {m.requiresPrescription && (
            <details className="alert info">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('med.whyPrescription')}</summary>
              <p style={{ marginTop: 8, marginBottom: 0 }}>{t('med.whyPrescriptionText')}</p>
            </details>
          )}
          <div className="row">
            <AvailabilityText n={m.availableAt} />
          </div>
          <button
            type="button"
            className="btn"
            disabled={!anyInStock}
            onClick={() => setSheet({ pharmacyId: null })}
            data-testid="request-button"
          >
            {t('med.request')}
          </button>
          {pharmacies !== null && !anyInStock && <FollowButton medicineId={m.id} />}
        </div>
      </div>

      <section className="card stack" aria-labelledby="ph">
        <h2 id="ph">{t('med.pharmacies')}</h2>
        <LocationControl compact />
        {pharmacies === null ? (
          // Space reserved for the list (about three rows and the map): when it arrives, nothing below it jumps.
          <div style={{ minHeight: 560 }}>
            <CardSkeleton lines={6} />
          </div>
        ) : pharmacies.length === 0 ? (
          <Empty>{t('med.noPharmacies')}</Empty>
        ) : (
          <div>
            <fieldset className="row pharmacy-filters" style={{ gap: 12, border: 0, padding: 0, margin: '0 0 8px' }}>
              <legend className="sr-only">{t('med.filters')}</legend>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> {t('med.filter.openNow')}
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} /> {t('med.filter.inStock')}
              </label>
              {saved.length > 0 && (
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} /> {t('saved.only')}
                </label>
              )}
              <label className="row" style={{ gap: 6 }}>
                {t('med.filter.distance')}
                <select value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))}>
                  <option value={0}>{t('med.filter.anyDistance')}</option>
                  {[2, 5, 10, 20].map((k) => (
                    <option key={k} value={k}>
                      ≤ {k} km
                    </option>
                  ))}
                </select>
              </label>
              <label className="row" style={{ gap: 6 }}>
                {t('med.filter.sort')}
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'distance' | 'price')}>
                  <option value="distance">{t('med.filter.sortDistance')}</option>
                  <option value="price">{t('med.filter.sortPrice')}</option>
                </select>
              </label>
            </fieldset>
            {filtered.length === 0 && (
              <Empty>
                {t('med.filter.none')}{' '}
                <button type="button" className="btn ghost small" onClick={resetFilters}>
                  {t('med.filter.reset')}
                </button>
              </Empty>
            )}
            {filtered.map((p) => (
              <div key={p.id} className="pharmacy-row" data-testid="pharmacy-row">
                <div className="stack" style={{ gap: 4 }}>
                  <Link to={`/pharmacies/${p.id}`} style={{ fontWeight: 700 }}>
                    {p.name}
                  </Link>
                  <span className="badge info" style={{ width: 'fit-content' }}>
                    {t('med.verifiedByStaff')}
                  </span>
                  <span className="muted small">
                    {p.address} · {formatKm(p.distanceKm, locale)}
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className={`badge ${!p.inStock ? 'neutral' : p.lowStock ? 'warn' : 'ok'}`}>
                      {!p.inStock
                        ? t('med.outOfStock')
                        : p.lowStock
                          ? `${t('med.lowStock')} · ${p.quantity}`
                          : `${t('med.inStock')} · ${p.quantity}`}
                    </span>
                    {p.priceEur != null && <span className="small">{formatPrice(p.priceEur, locale)}</span>}
                    {cheapest != null && p.inStock && p.priceEur === cheapest && <span className="badge ok">{t('med.cheapest')}</span>}
                    <OpenBadge hours={p.openingHours} onDuty={p.onDuty} />
                  </span>
                </div>
                <SaveButton pharmacyId={p.id} name={p.name} />
                {p.inStock && (
                  <button type="button" className="btn secondary small" onClick={() => setSheet({ pharmacyId: p.id })}>
                    {t('med.chooseThis')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {pharmacies && pharmacies.length > 0 && (
          <LazyMap
            center={place}
            radiusKm={30}
            pharmacies={filtering ? filtered : pharmacies}
            stockMode
            onChoose={(pid) => setSheet({ pharmacyId: pid })}
            height={380}
          />
        )}
      </section>

      <p className="alert info small" role="note" data-testid="med-disclaimer">
        {t('med.disclaimer')}
      </p>

      <section aria-labelledby="gen">
        <h2 id="gen">{t('med.generics')}</h2>
        {data.generics.length === 0 ? (
          <p className="muted">{t('med.noGenerics')}</p>
        ) : (
          <div className="grid cols-2">
            {data.generics.map((g) => (
              <MedicineCard key={g.id} m={g} />
            ))}
          </div>
        )}
      </section>

      {sheet && pharmacies && (
        <RequestSheet medicine={m} pharmacies={pharmacies} initialPharmacyId={sheet.pharmacyId} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
