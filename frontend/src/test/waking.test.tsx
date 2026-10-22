import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('hosted backend that is asleep', () => {
  it('shows "waking up" after 4 s, retries a GET on 503 and hides the banner when the server answers', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.onrender.com/');
    vi.resetModules();
    vi.useFakeTimers();
    const { fetchAwake } = await import('../lib/api');
    const { onWaking, apiUrl } = await import('../lib/apiBase');
    expect(apiUrl('/health')).toBe('https://api.example.onrender.com/api/health');
    const seen: boolean[] = [];
    onWaking((w) => seen.push(w));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = fetchAwake(apiUrl('/health'), {}, true);
    await vi.advanceTimersByTimeAsync(4100);
    const res = await p;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('does not retry a POST and does nothing in development (no VITE_API_URL)', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.resetModules();
    const { fetchAwake } = await import('../lib/api');
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchAwake('/api/x', { method: 'POST' }, false);
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
