/** Thin fetch wrapper. Always relative /api (proxied by Vite), never a hard-coded host. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'counter.token';
let token: string | null = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the session lasts until the tab closes
  }
}
export const getToken = () => token;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  let url = `/api${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'The server cannot be reached. Is `npm run dev` running?', 'network');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // The proxy answers with plain text/HTML when the API is down.
    if (!res.ok) {
      throw new ApiError(
        res.status,
        res.status === 502 || res.status === 504 || res.status === 500
          ? 'The API is not running. Start it with `npm run dev`.'
          : `Unexpected answer (${res.status}).`,
      );
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    if (res.status === 401 && token && body.code !== 'invalid_credentials') onUnauthorized?.();
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status}).`, body.code, body.details);
  }
  return data as T;
}
