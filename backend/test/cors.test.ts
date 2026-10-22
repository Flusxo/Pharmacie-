import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { FRONTEND_ORIGINS } from '../src/config.js';

describe('CORS', () => {
  const app = createApp();

  it('answers the configured site address', async () => {
    const origin = FRONTEND_ORIGINS[0];
    const res = await request(app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('does not answer any other address', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
