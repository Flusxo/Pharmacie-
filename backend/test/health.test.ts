import { describe, expect, it } from 'vitest';
import { api } from './helpers.js';

describe('health and basics', () => {
  it('reports database ok', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns a clear 404 for unknown API routes', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No API route');
  });

  it('serves the OpenAPI document', async () => {
    const res = await api().get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });
});
