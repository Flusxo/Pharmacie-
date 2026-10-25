import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';

beforeAll(freshDb);

describe('optional services panel', () => {
  it('staff see which services are configured (booleans only); nobody else can', async () => {
    const admin = await login('admin');
    const res = await api().get('/api/admin/integrations').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.email).toEqual({ configured: false });
    expect(res.body.errorAlerts).toEqual({ configured: false });
    expect(res.body.push).toEqual({ built: false });
    expect(res.body.storage).toEqual({ built: false });
    expect(JSON.stringify(res.body)).not.toMatch(/sk_|whsec_|re_|https?:/);
    expect((await api().get('/api/admin/integrations').set(auth(await login('alice')))).status).toBe(403);
    expect((await api().get('/api/admin/integrations')).status).toBe(401);
  });
});
