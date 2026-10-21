import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { searchAddress, usePlace, type BanResult } from '../lib/location';
import { IconPin, IconTarget } from './Icons';

/** Shows which location is used; "Use my current location"; postcode/address fallback (BAN). Never blocks. */
export function LocationControl({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { place, locating, error, useDevice, setAddress } = usePlace();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<BanResult[]>([]);

  useEffect(() => {
    if (error) setEditing(true);
  }, [error]);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      searchAddress(q, ctrl.signal)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const label =
    place.source === 'device'
      ? t('location.device')
      : place.source === 'profile'
        ? t('location.profile')
        : place.source === 'address'
          ? (place.label ?? '')
          : t('location.default');

  return (
    <div className="stack" style={{ gap: 8 }} data-testid="location-control">
      <div className="row" style={{ gap: 8 }}>
        <IconPin width={18} height={18} />
        <span className={compact ? 'small' : ''}>{t('location.using', { label })}</span>
        <button type="button" className="btn ghost small" onClick={useDevice} disabled={locating}>
          <IconTarget width={16} height={16} /> {locating ? t('location.locating') : t('location.useMine')}
        </button>
        <button type="button" className="btn ghost small" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          {t('location.change')}
        </button>
      </div>
      {error && (
        <div className="alert warn small" role="status">
          {t('location.denied')}
        </div>
      )}
      {editing && (
        <div className="field" style={{ position: 'relative' }}>
          <label htmlFor="addr">{t('location.addressLabel')}</label>
          <input
            id="addr"
            className="input"
            value={q}
            placeholder={t('location.addressPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="postal-code"
          />
          {results.length > 0 && (
            <ul className="suggestions" role="listbox" aria-label={t('location.addressLabel')}>
              {results.map((r) => (
                <li
                  key={r.label}
                  role="option"
                  aria-selected={false}
                  tabIndex={0}
                  onClick={() => {
                    setAddress({ lat: r.lat, lon: r.lon, label: r.label });
                    setEditing(false);
                    setQ('');
                    setResults([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAddress({ lat: r.lat, lon: r.lon, label: r.label });
                      setEditing(false);
                    }
                  }}
                >
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
