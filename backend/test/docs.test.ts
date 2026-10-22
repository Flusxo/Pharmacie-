import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

describe('API documentation', () => {
  it('is served outside production', async () => {
    const { createApp } = await import('../src/app.js');
    expect((await request(createApp()).get('/api/openapi.json')).status).toBe(200);
  });

  it('is not served in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a-long-production-like-secret-for-this-test-only');
    try {
      const { createApp } = await import('../src/app.js');
      const app = createApp();
      expect((await request(app).get('/api/openapi.json')).status).toBe(404);
      expect((await request(app).get('/api/docs/')).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
