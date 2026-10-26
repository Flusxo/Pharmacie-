import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pushKeysPresent } from '../src/config.js';

beforeAll(freshDb);

describe('optional services panel', () => {
  it('staff see which services are configured (booleans only); nobody else can', async () => {
    const admin = await login('admin');
    const res = await api().get('/api/admin/integrations').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.email).toEqual({ configured: false });
    expect(res.body.errorAlerts).toEqual({ configured: false });
    expect(res.body.push).toEqual({ configured: false, built: false });
    expect(res.body.storage).toEqual({ built: false });
    expect(JSON.stringify(res.body)).not.toMatch(/sk_|whsec_|re_|https?:|vapid/i);
    expect((await api().get('/api/admin/integrations').set(auth(await login('alice')))).status).toBe(403);
    expect((await api().get('/api/admin/integrations')).status).toBe(401);
  });

  it('web push counts as "keys found" only with both keys, and sending stays unbuilt either way', () => {
    expect(pushKeysPresent({})).toBe(false);
    expect(pushKeysPresent({ VAPID_PUBLIC_KEY: 'pub' })).toBe(false);
    expect(pushKeysPresent({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: '  ' })).toBe(false);
    expect(pushKeysPresent({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toBe(true);
  });
});
