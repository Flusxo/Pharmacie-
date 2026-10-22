/**
 * Where the API lives. Local development: empty, so the browser calls the relative /api path and the Vite
 * proxy forwards it. Hosted (Cloudflare Pages): VITE_API_URL is the backend's address, e.g. https://x.onrender.com.
 */
const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
export const API_BASE = raw.trim().replace(/\/+$/, '');
export const apiUrl = (path: string) => `${API_BASE}/api${path}`;
/** True when the backend is a separate (free, sleeping) service. */
export const REMOTE_API = API_BASE !== '';

// "Waking up the server": a request that takes long on a hosted backend means the free service is asleep.
type Listener = (waking: boolean) => void;
const listeners = new Set<Listener>();
let waking = false;
export function setWaking(v: boolean): void {
  if (v === waking) return;
  waking = v;
  listeners.forEach((l) => l(v));
}
export function onWaking(l: Listener): () => void {
  listeners.add(l);
  l(waking);
  return () => {
    listeners.delete(l);
  };
}
