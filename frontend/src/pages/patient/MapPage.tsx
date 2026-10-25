import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { usePlace } from '../../lib/location';
import { formatKm } from '../../lib/format';
import type { Medicine, NearbyPharmacy } from '../../lib/types';
import { LazyMap } from '../../components/map/LazyMap';
import { LocationControl } from '../../components/LocationControl';
import { RequestSheet } from '../../components/RequestSheet';
import { SaveButton } from '../../components/SaveButton';
import { useSavedPharmacies } from '../../lib/saved';
import { CardSkeleton, Empty, OpenBadge } from '../../components/ui';

function MedicinePicker({ value, onPick }: { value: Medicine | null; onPick: (m: Medicine | null) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ id: string; name: string; dosage: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api<{ items: { id: string; name: string; dosage: string }[] }>('/medicines/suggest', { query: { q }, signal: ctrl.signal })
        .then((r) => setItems(r.items))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);
  if (value)
    return (
      <div className="row">
        <span className="badge info">{t('map.stockFor', { name: value.name })}</span>
        <button type="button" className="btn ghost small" onClick={() => onPick(null)}>
          {t('map.clear')}
        </button>
      </div>
    );
  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor="map-med">{t('map.medicineFilter')}</label>
      <input
        id="map-med"
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('home.searchPlaceholder')}
        autoComplete="off"
      />
      {items.length > 0 && (
        <ul className="suggestions" role="listbox">
          {items.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() =>
                void api<{ medicine: Medicine }>(`/medicines/${s.id}`).then((r) => {
                  onPick(r.medicine);
                  setQ('');
                  setItems([]);
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') void api<{ medicine: Medicine }>(`/medicines/${s.id}`).then((r) => onPick(r.medicine));
              }}
            >
              {s.name} <span className="muted small">{s.dosage}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A list and a map that stay in sync: clicking a pin highlights and scrolls the list; clicking the list flies the map. */
export function PharmacyListMap({
  pharmacies,
  stockMode,
  radiusKm,
  onChoose,
  onWiden,
}: {
  pharmacies: NearbyPharmacy[];
  stockMode: boolean;
  radiusKm?: number;
  onChoose?: (id: string) => void;
  /** Offered when nothing is in range. */
  onWiden?: () => void;
}) {
  const { t, locale } = useI18n();
  const { place } = usePlace();
  const [selected, setSelectedId] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const { saved, isSaved } = useSavedPharmacies();
  const shown = savedOnly ? pharmacies.filter((p) => isSaved(p.id)) : pharmacies;
  const chosen = pharmacies.find((p) => p.id === selected) ?? null;
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const setSelected = setSelectedId;

  const select = (id: string, fromMap: boolean) => {
    setSelected(id);
    if (fromMap) rows.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className="map-layout">
      <div className="card map-list" aria-label={pharmacies.length === 1 ? t('map.listOne') : t('map.list', { n: pharmacies.length })}>
        {saved.length > 0 && (
          <label className="check small" style={{ padding: '8px 4px' }}>
            <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
            <span>{t('saved.only')}</span>
          </label>
        )}
        {pharmacies.length === 0 && (
          <Empty>
            <p data-testid="none-in-range">{t('map.noneInRange')}</p>
            {onWiden && (
              <button type="button" className="btn secondary small" onClick={onWiden}>
                {t('map.increaseRadius')}
              </button>
            )}
          </Empty>
        )}
        {shown.map((p) => (
          <div key={p.id} className="map-item">
            <button
              type="button"
              className={`pharmacy-row ${selected === p.id ? 'selected' : ''}`}
              aria-current={selected === p.id ? 'true' : undefined}
              ref={(el) => {
                if (el) rows.current.set(p.id, el);
                else rows.current.delete(p.id);
              }}
              onClick={() => select(p.id, false)}
              data-testid="map-list-item"
            >
              <span className="stack" style={{ gap: 4 }}>
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.city} · {formatKm(p.distanceKm, locale)}
                </span>
                <OpenBadge hours={p.openingHours} onDuty={p.onDuty} />
              </span>
              {stockMode && (
                <span className={`badge ${p.inStock ? (p.lowStock ? 'warn' : 'ok') : 'neutral'}`}>
                  {p.inStock ? (p.lowStock ? t('med.lowStock') : t('med.inStock')) : t('med.outOfStock')}
                </span>
              )}
            </button>
            <SaveButton pharmacyId={p.id} name={p.name} />
          </div>
        ))}
        {chosen && (
          <div className="stack small" style={{ gap: 6, padding: '10px 4px' }} data-testid="route-info">
            <strong>{t('map.routeTitle', { name: chosen.name })}</strong>
            <span className="muted">{t('map.routeLine', { km: formatKm(chosen.distanceKm, locale) })}</span>
            <a
              className="btn secondary small"
              style={{ width: 'fit-content' }}
              href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${place.lat}%2C${place.lon}%3B${chosen.latitude}%2C${chosen.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('map.routeOpen')}
            </a>
          </div>
        )}
      </div>
      <LazyMap
        center={place}
        radiusKm={radiusKm}
        pharmacies={shown}
        selectedId={selected}
        route={
          chosen
            ? [
                [place.lat, place.lon],
                [chosen.latitude, chosen.longitude],
              ]
            : undefined
        }
        fitRoute={false}
        onSelect={(id) => select(id, true)}
        onChoose={onChoose}
        stockMode={stockMode}
        height={520}
      />
    </div>
  );
}

export function MapPage() {
  const { t } = useI18n();
  const { place } = usePlace();
  const [params, setParams] = useSearchParams();
  const [radius, setRadius] = useState(15);
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [pharmacies, setPharmacies] = useState<NearbyPharmacy[] | null>(null);
  const [chooseId, setChooseId] = useState<string | null>(null);
  const medicineId = params.get('medicine');

  useEffect(() => {
    if (medicineId && medicine?.id !== medicineId)
      api<{ medicine: Medicine }>(`/medicines/${medicineId}`)
        .then((r) => setMedicine(r.medicine))
        .catch(() => {});
  }, [medicineId, medicine?.id]);

  useEffect(() => {
    setPharmacies(null);
    const q = { lat: place.lat, lon: place.lon, radiusKm: radius };
    const ctrl = new AbortController();
    const req = medicine
      ? api<{ items: NearbyPharmacy[] }>(`/medicines/${medicine.id}/pharmacies`, { query: q, signal: ctrl.signal })
      : api<{ items: NearbyPharmacy[] }>('/pharmacies/nearby', { query: q, signal: ctrl.signal });
    req.then((r) => setPharmacies(r.items)).catch(() => {});
    return () => ctrl.abort();
  }, [place.lat, place.lon, radius, medicine]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>{t('map.title')}</h1>
      <div className="card stack">
        <LocationControl compact />
        <div className="grid cols-2" style={{ alignItems: 'end' }}>
          <MedicinePicker
            value={medicine}
            onPick={(m) => {
              setMedicine(m);
              const next = new URLSearchParams(params);
              if (m) next.set('medicine', m.id);
              else next.delete('medicine');
              setParams(next, { replace: true });
            }}
          />
          <div className="field">
            <label htmlFor="radius">{t('map.radius', { km: radius })}</label>
            <input
              id="radius"
              className="range"
              type="range"
              min={1}
              max={30}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </div>
        </div>
        {!medicine && (
          <p className="muted small" style={{ margin: 0 }}>
            {t('map.pickMedicineToChoose')}
          </p>
        )}
      </div>
      {pharmacies === null ? (
        <CardSkeleton lines={6} />
      ) : (
        <PharmacyListMap
          onWiden={radius < 30 ? () => setRadius(30) : undefined}
          pharmacies={pharmacies}
          stockMode={!!medicine}
          radiusKm={radius}
          onChoose={medicine ? (id) => setChooseId(id) : undefined}
        />
      )}
      {chooseId && medicine && pharmacies && (
        <RequestSheet medicine={medicine} pharmacies={pharmacies} initialPharmacyId={chooseId} onClose={() => setChooseId(null)} />
      )}
    </div>
  );
}
