/** Thin fetch wrapper. Relative /api in development (proxied by Vite); VITE_API_URL when the backend is hosted elsewhere. */
import { REMOTE_API, apiUrl, holdWaking } from './apiBase';

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

import { translate, type Lang } from '../i18n';

/** The UI language, sent as Accept-Language so the API answers (errors, messages) in it. */
let apiLang: Lang = 'fr';
export function setApiLanguage(l: Lang): void {
  apiLang = l;
}

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * The public catalogue (medicines, pharmacies near a point) is the same for everybody: a repeated search or a
 * back-navigation within 20 s is answered from memory (and concurrent identical requests share one call).
 * Any write clears it, so the next read is fresh.
 */
const CATALOGUE = /^\/(medicines|pharmacies)(\/|$|\?)/;
const CATALOGUE_TTL_MS = 20_000;
const catalogue = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  let url = apiUrl(path);
  const isGet = (opts.method ?? 'GET') === 'GET';
  if (!isGet) catalogue.clear();
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const cacheKey = isGet && CATALOGUE.test(path) && !opts.signal ? `${apiLang}|${url}` : null;
  if (cacheKey) {
    const hit = catalogue.get(cacheKey);
    if (hit && Date.now() - hit.at < CATALOGUE_TTL_MS) return hit.data as T;
    const pending = inflight.get(cacheKey);
    if (pending) return pending as Promise<T>;
    const p = api<T>(path, { ...opts, signal: new AbortController().signal }).then(
      (data) => {
        catalogue.set(cacheKey, { at: Date.now(), data });
        inflight.delete(cacheKey);
        return data;
      },
      (err) => {
        inflight.delete(cacheKey);
        throw err;
      },
    );
    inflight.set(cacheKey, p);
    return p;
  }
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': apiLang };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = opts.method ?? 'GET';
  const init: RequestInit = {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  };
  let res: Response;
  try {
    res = await fetchAwake(url, init, method === 'GET');
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, translate(apiLang, 'api.network'), 'network');
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
          ? translate(apiLang, 'api.down')
          : translate(apiLang, 'api.unexpected', { status: res.status }),
      );
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    if (res.status === 401 && token && body.code !== 'invalid_credentials') onUnauthorized?.();
    throw new ApiError(res.status, body.error ?? translate(apiLang, 'api.failed', { status: res.status }), body.code, body.details);
  }
  return data as T;
}

/**
 * Fetch that copes with a sleeping free backend: when the answer takes more than 1.5 s the "waking up the
 * server" banner shows, and a GET that fails with a network error or a gateway error (502/503/504, what the
 * host answers while the service starts) is retried quietly every 3 s for about a minute and a half.
 */
export async function fetchAwake(url: string, init: RequestInit, retry: boolean): Promise<Response> {
  if (!REMOTE_API) return fetch(url, init);
  let release: (() => void) | null = null;
  const timer = setTimeout(() => (release ??= holdWaking()), 1500);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await fetch(url, init);
        if (![502, 503, 504].includes(res.status) || !retry || attempt >= 22) return res;
      } catch (err) {
        if ((err as Error).name === 'AbortError' || !retry || attempt >= 22) throw err;
      }
      release ??= holdWaking();
      await new Promise((r) => setTimeout(r, 3000));
    }
  } finally {
    clearTimeout(timer);
    release?.();
  }
}
