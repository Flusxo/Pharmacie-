import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/fr';
import { ApiError, api } from '../../lib/api';
import { usePlace } from '../../lib/location';
import { formatKm, formatPrice } from '../../lib/format';
import type { Medicine, NearbyPharmacy } from '../../lib/types';
import { ProductVisual } from '../../components/three/ThreeVisuals';
import { RequestSheet } from '../../components/RequestSheet';
import { LazyMap } from '../../components/map/LazyMap';
import { LocationControl } from '../../components/LocationControl';
import { CardSkeleton, Empty, ErrorBox, OpenBadge, RxBadge } from '../../components/ui';
import { AvailabilityText, MedicineCard } from './Search';

export function MedicineDetailsPage() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const { place } = usePlace();
  const [data, setData] = useState<{ medicine: Medicine; generics: Medicine[] } | null>(null);
  const [pharmacies, setPharmacies] = useState<NearbyPharmacy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ pharmacyId: string | null } | null>(null);

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

  return (
    <div className="stack" style={{ gap: 28 }}>
      <Link to="/search" className="small">
        ← {t('common.back')}
      </Link>
      <div className="details">
        <ProductVisual name={m.name} dosage={m.dosage} form={m.form} category={m.category} cip13={m.cip13} imageUrl={m.imageUrl} requiresPrescription={m.requiresPrescription} />
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <span className="badge neutral">{t(`cat.${m.category}` as MessageKey)}</span>
            <RxBadge rx={m.requiresPrescription} />
            {!m.requiresPrescription && <span className="badge ok">{t('common.noPrescription')}</span>}
          </div>
          <h1 style={{ marginBottom: 0 }}>{m.name}</h1>
          <p className="muted" style={{ fontSize: '1.05rem' }}>
            {m.description}
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
              <dd style={{ margin: 0 }}>{m.ageNote}</dd>
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
        </div>
      </div>

      <section className="card stack" aria-labelledby="ph">
        <h2 id="ph">{t('med.pharmacies')}</h2>
        <LocationControl compact />
        {pharmacies === null ? (
          <CardSkeleton />
        ) : pharmacies.length === 0 ? (
          <Empty>{t('med.noPharmacies')}</Empty>
        ) : (
          <div>
            {pharmacies.map((p) => (
              <div key={p.id} className="pharmacy-row" data-testid="pharmacy-row">
                <div className="stack" style={{ gap: 4 }}>
                  <strong>{p.name}</strong>
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
                    <OpenBadge hours={p.openingHours} onDuty={p.onDuty} />
                  </span>
                </div>
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
            pharmacies={pharmacies}
            stockMode
            onChoose={(pid) => setSheet({ pharmacyId: pid })}
            height={380}
          />
        )}
      </section>

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
