/**
 * Leaflet map (master prompt section 10):
 * - Tiles come ONLY from VITE_MAP_TILE_URL (e.g. MapTiler raster). No default tile server (no OSM, no CARTO).
 * - Empty URL or failing tiles -> clear in-map message with Retry. Pins, popups and the list keep working.
 * - Attribution always visible: © MapTiler © OpenStreetMap contributors.
 * Loaded lazily (React.lazy) so Leaflet never slows the first page.
 */
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useI18n } from '../../i18n';
import { formatKm } from '../../lib/format';
import { useReducedMotion } from '../../lib/settings';
import { resolveTileUrl } from '../../lib/tiles';
import { animate } from 'framer-motion';
import { duration, easeOut } from '../../motion';

export const MAP_ATTRIBUTION =
  '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';

/** URL of the tile that contains a point, used to check the provider's real HTTP status. */
export function probeTileUrl(template: string, lat: number, lon: number, z: number): string {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{r}', '');
}

export interface MapPharmacy {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm?: number | null;
  inStock?: boolean;
  quantity?: number;
}

export interface ExtraMarker {
  id: string;
  lat: number;
  lon: number;
  kind: 'pharmacy' | 'home' | 'courier';
  label: string;
}

interface Props {
  center: { lat: number; lon: number };
  radiusKm?: number;
  pharmacies?: MapPharmacy[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChoose?: (id: string) => void;
  /** Show stock in popups / grey pins for out-of-stock. */
  stockMode?: boolean;
  extraMarkers?: ExtraMarker[];
  route?: [number, number][];
  height?: number | string;
  showPatient?: boolean;
  zoom?: number;
  /** Overrides VITE_MAP_TILE_URL (tests). */
  tileUrl?: string;
  footer?: ReactNode;
}

const pinIcon = (inStock: boolean, selected: boolean, delayMs: number) =>
  L.divIcon({
    className: '',
    html: `<span class="pin ${inStock ? 'pin-ok' : 'pin-off'} ${selected ? 'pin-selected' : ''}" style="animation-delay:${delayMs}ms"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor"/></svg></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30],
  });
const patientIcon = L.divIcon({
  className: '',
  html: '<span class="patient-dot"><span></span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
const homeIcon = L.divIcon({ className: '', html: '<span class="pin pin-home">⌂</span>', iconSize: [34, 34], iconAnchor: [17, 34] });
const courierIcon = L.divIcon({ className: '', html: '<span class="courier">🛵</span>', iconSize: [36, 36], iconAnchor: [18, 18] });

/** Keeps the view in sync with the selected pharmacy (fly to it). */
function FlyTo({ target, reduced }: { target: [number, number] | null; reduced: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (reduced) map.setView(target, Math.max(map.getZoom(), 12));
    else map.flyTo(target, Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [target, map, reduced]);
  return null;
}

function FitRadius({ center, radiusKm }: { center: [number, number]; radiusKm?: number }) {
  const map = useMap();
  useEffect(() => {
    // A map with no size (hidden tab, test DOM) cannot compute a zoom; skip until it has one.
    if (!radiusKm || map.getSize().x === 0) return;
    map.fitBounds(L.latLng(center).toBounds(radiusKm * 2000), { animate: false, padding: [12, 12] });
  }, [center, radiusKm, map]);
  return null;
}

function FitRoute({ route }: { route?: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (route && route.length > 1 && map.getSize().x > 0) map.fitBounds(L.latLngBounds(route), { padding: [40, 40], animate: false });
  }, [route, map]);
  return null;
}

export default function PharmacyMap({
  center,
  radiusKm,
  pharmacies = [],
  selectedId,
  onSelect,
  onChoose,
  stockMode = false,
  extraMarkers = [],
  route,
  height = 420,
  showPatient = true,
  zoom = 12,
  tileUrl = import.meta.env.VITE_MAP_TILE_URL ?? '',
  footer,
}: Props) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const tiles = useMemo(() => resolveTileUrl(tileUrl), [tileUrl]);
  const configured = tiles.url !== '';
  const [tileState, setTileState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(0);
  const markers = useRef(new Map<string, L.Marker>());

  const [failure, setFailure] = useState<'key' | 'other' | null>(null);
  useEffect(() => {
    loaded.current = 0;
    setTileState('loading');
    setFailure(null);
  }, [attempt, tileUrl]);

  // Some providers (MapTiler included) answer a bad key with HTTP 403 AND an "Invalid key" picture, which
  // Leaflet counts as a loaded tile. Probe one tile's real status so a rejected key is reported clearly.
  useEffect(() => {
    if (!tiles.url) return;
    const ctrl = new AbortController();
    void fetch(probeTileUrl(tiles.url, center.lat, center.lon, zoom), { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) {
          setFailure(r.status === 401 || r.status === 403 ? 'key' : 'other');
          setTileState('failed');
        }
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') {
          setFailure('other');
          setTileState('failed');
        }
      });
    return () => ctrl.abort();
    // Probe once per URL / retry, not on every pan.
  }, [tiles.url, attempt]);

  // Open the popup of the selected pharmacy (selection from the list).
  useEffect(() => {
    if (selectedId) markers.current.get(selectedId)?.openPopup();
  }, [selectedId]);

  // The radius circle redraws smoothly when the slider moves.
  const [shownRadius, setShownRadius] = useState(radiusKm ?? 0);
  const radiusRef = useRef(radiusKm ?? 0);
  useEffect(() => {
    if (radiusKm === undefined) return;
    if (reduced) {
      radiusRef.current = radiusKm;
      setShownRadius(radiusKm);
      return;
    }
    const controls = animate(radiusRef.current, radiusKm, {
      duration: duration.base,
      ease: easeOut,
      onUpdate: (v) => {
        radiusRef.current = v;
        setShownRadius(v);
      },
    });
    return () => controls.stop();
  }, [radiusKm, reduced]);

  const selected = pharmacies.find((p) => p.id === selectedId);
  const target = useMemo<[number, number] | null>(() => (selected ? [selected.latitude, selected.longitude] : null), [selected]);
  const c: [number, number] = [center.lat, center.lon];
  const showMessage = !configured || tileState === 'failed';

  return (
    <div className="map-wrap" style={{ height }} data-testid="map">
      <MapContainer center={c} zoom={zoom} style={{ height: '100%', width: '100%' }} attributionControl={false} scrollWheelZoom keyboard>
        <AttributionAlways />
        {configured && tileState !== 'failed' && (
          <TileLayer
            key={attempt}
            url={tiles.url}
            tileSize={256}
            crossOrigin
            eventHandlers={{
              tileload: () => {
                loaded.current += 1;
                // A late tile event must never hide a failure already detected by the probe.
                setTileState((st) => (st === 'failed' ? st : 'ok'));
              },
              tileerror: () => {
                if (loaded.current === 0) setTileState('failed');
              },
            }}
          />
        )}
        <FitRadius center={c} radiusKm={radiusKm} />
        <FitRoute route={route} />
        <FlyTo target={target} reduced={reduced} />
        {radiusKm !== undefined && (
          <Circle
            center={c}
            radius={shownRadius * 1000}
            pathOptions={{ color: '#3B82F6', weight: 1.5, fillOpacity: 0.06, dashArray: '6 6' }}
          />
        )}
        {showPatient && (
          <Marker
            position={c}
            icon={patientIcon}
            title={t('map.you')}
            alt={t('map.you')}
            keyboard={false}
            interactive={false}
            zIndexOffset={-1000}
          />
        )}
        {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#10B981', weight: 4, opacity: 0.8 }} />}
        {pharmacies.map((p, i) => {
          const inStock = stockMode ? !!p.inStock : true;
          const label = `${p.name}${stockMode ? ` — ${inStock ? t('med.inStock') : t('med.outOfStock')}` : ''}`;
          return (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={pinIcon(inStock, p.id === selectedId, reduced ? 0 : Math.min(i * 60, 600))}
              title={label}
              alt={label}
              keyboard
              ref={(m) => {
                if (m) markers.current.set(p.id, m);
                else markers.current.delete(p.id);
              }}
              eventHandlers={{ click: () => onSelect?.(p.id) }}
            >
              <Popup>
                <div className="stack" style={{ gap: 4, minWidth: 180 }} data-testid="map-popup">
                  <strong>{p.name}</strong>
                  <span className="small">{p.address}</span>
                  {p.distanceKm != null && <span className="small">{formatKm(p.distanceKm, locale)}</span>}
                  {stockMode && (
                    <span className={`badge ${inStock ? 'ok' : 'neutral'}`}>
                      {inStock ? `${t('med.inStock')} · ${p.quantity ?? ''}` : t('med.outOfStock')}
                    </span>
                  )}
                  {onChoose && inStock && (
                    <button type="button" className="btn small" onClick={() => onChoose(p.id)}>
                      {t('med.chooseThis')}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {extraMarkers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lon]}
            icon={m.kind === 'home' ? homeIcon : m.kind === 'courier' ? courierIcon : pinIcon(true, false, 0)}
            title={m.label}
            alt={m.label}
          />
        ))}
      </MapContainer>
      {showMessage && (
        <div className="map-message" role="status" data-testid="map-fallback">
          <p>
            {tileState === 'failed'
              ? t(failure === 'key' ? 'map.keyRejected' : 'map.tilesFailed')
              : t(
                  tiles.problem === 'subdomains'
                    ? 'map.problemSubdomains'
                    : tiles.problem === 'style'
                      ? 'map.problemStyle'
                      : tiles.problem === 'invalid'
                        ? 'map.problemInvalid'
                        : 'map.notConfigured',
                )}
          </p>
          <button type="button" className="btn secondary small" onClick={() => setAttempt((a) => a + 1)}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {footer}
    </div>
  );
}

/** The attribution control, always on (even while tiles are missing). */
function AttributionAlways() {
  const map = useMap();
  useEffect(() => {
    const ctl = L.control.attribution({ prefix: false }).addTo(map);
    ctl.addAttribution(MAP_ATTRIBUTION);
    return () => {
      ctl.remove();
    };
  }, [map]);
  return null;
}
