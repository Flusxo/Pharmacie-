import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

export type LocationSource = 'device' | 'profile' | 'address' | 'default';
export interface Place {
  lat: number;
  lon: number;
  source: LocationSource;
  label?: string;
}

// Tournon-sur-Rhône: where the demo data lives.
export const DEFAULT_PLACE: Place = { lat: 45.0672, lon: 4.8329, source: 'default' };

interface LocationCtx {
  place: Place;
  locating: boolean;
  error: string | null;
  useDevice: () => void;
  setAddress: (p: { lat: number; lon: number; label: string }) => void;
}
const Ctx = createContext<LocationCtx | null>(null);

/** Session-only location. Never blocks the app: falls back to the saved address, then to the default place. */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [override, setOverride] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profilePlace: Place | null =
    user?.patient?.latitude != null && user.patient.longitude != null
      ? { lat: user.patient.latitude, lon: user.patient.longitude, source: 'profile' }
      : null;

  useEffect(() => {
    if (!user) setOverride(null);
  }, [user]);

  const useDevice = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('unavailable');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOverride({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'device' });
        setLocating(false);
      },
      () => {
        setError('denied');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  const setAddress = useCallback((p: { lat: number; lon: number; label: string }) => {
    setOverride({ lat: p.lat, lon: p.lon, source: 'address', label: p.label });
    setError(null);
  }, []);

  const place = override ?? profilePlace ?? DEFAULT_PLACE;
  const value = useMemo(() => ({ place, locating, error, useDevice, setAddress }), [place, locating, error, useDevice, setAddress]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlace(): LocationCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlace must be used inside LocationProvider');
  return c;
}

export interface BanResult {
  label: string;
  lat: number;
  lon: number;
  city: string;
}

/** Free French address API (Base Adresse Nationale). Called from the browser; no key needed. */
export async function searchAddress(q: string, signal?: AbortSignal): Promise<BanResult[]> {
  if (q.trim().length < 3) return [];
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: { label: string; city: string } }[];
  };
  return data.features.map((f) => ({
    label: f.properties.label,
    city: f.properties.city,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}
