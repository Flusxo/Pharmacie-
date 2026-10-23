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
// Several requests can wait at once: the banner shows while at least one waits.
let waking = false;
let holds = 0;
function refresh(): void {
  const v = holds > 0;
  if (v === waking) return;
  waking = v;
  listeners.forEach((l) => l(v));
}
/** Shows the banner until the returned function is called (safe to call more than once). */
export function holdWaking(): () => void {
  holds += 1;
  refresh();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds -= 1;
    refresh();
  };
}

/**
 * Wakes the free backend as soon as the site opens (a sleeping Render service takes up to a minute to start), so
 * that by the time the visitor searches it is already awake; the banner shows if it does not answer within 1.5 s.
 */
export function warmUp(): void {
  if (!REMOTE_API || typeof fetch === 'undefined') return;
  const timer = setTimeout(() => (release = holdWaking()), 1500);
  let release: (() => void) | null = null;
  fetch(apiUrl('/health'), { cache: 'no-store' })
    .catch(() => undefined)
    .finally(() => {
      clearTimeout(timer);
      release?.();
    });
}
export function onWaking(l: Listener): () => void {
  listeners.add(l);
  l(waking);
  return () => {
    listeners.delete(l);
  };
}
