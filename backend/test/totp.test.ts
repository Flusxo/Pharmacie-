import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, PASSWORD } from './helpers.js';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, stepAt, verifyTotp } from '../src/totp.js';
import { pool } from '../src/db.js';

beforeAll(freshDb);

const loginRaw = (email: string, code?: string) => api().post('/api/auth/login').send({ email, password: PASSWORD, code });

describe('TOTP primitives', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(hotp(secret, stepAt(59_000), 8)).toBe('94287082');
    expect(hotp(secret, stepAt(1_111_111_109_000), 8)).toBe('07081804');
    expect(hotp(secret, stepAt(20_000_000_000_000), 8)).toBe('65353130');
  });

  it('base32 round-trips and accepts ±1 step of clock drift only', () => {
    const secret = Buffer.from('a secret of twenty b');
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, hotp(secret, stepAt(now) - 1), now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(secret, hotp(secret, stepAt(now) + 2), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('stores the secret encrypted', () => {
    const secret = Buffer.from('another secret 12345');
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret.toString('base64'));
    expect(enc).not.toContain(base32Encode(secret));
    expect(decryptSecret(enc).equals(secret)).toBe(true);
  });
});

describe('two-step verification for professionals', () => {
  const email = 'pharmacie.valence@pharmacie.test';
  let token = '';
  let secret: Buffer = Buffer.alloc(0);

  it('is refused for patients', async () => {
    const t = (await loginRaw('alice@pharmacie.test')).body.token;
    const res = await api().post('/api/auth/totp/setup').set(auth(t));
    expect(res.status).toBe(403);
  });

  it('setup returns a secret and an otpauth link, but stays off until a code is confirmed', async () => {
    token = (await loginRaw(email)).body.token;
    const res = await api().post('/api/auth/totp/setup').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+&issuer=/);
    secret = base32Decode(res.body.secret);
    const row = await pool.query('SELECT totp_enabled, totp_secret_enc FROM users WHERE email = $1', [email]);
    expect(row.rows[0].totp_enabled).toBe(false);
    expect(row.rows[0].totp_secret_enc).not.toContain(res.body.secret);
    // Still no code needed.
    expect((await loginRaw(email)).status).toBe(200);
  });

  it('enable refuses a wrong code with a clear 400, then accepts the app code', async () => {
    const bad = await api().post('/api/auth/totp/enable').set(auth(token)).send({ code: '000000' === hotp(secret, stepAt(Date.now())) ? '111111' : '000000' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/code is not correct/);
    const ok = await api().post('/api/auth/totp/enable').set(auth(token)).send({ code: hotp(secret, stepAt(Date.now())) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.totpEnabled).toBe(true);
  });

  it('login then asks for the code, refuses a wrong or reused one, accepts a fresh one', async () => {
    const noCode = await loginRaw(email);
    expect(noCode.status).toBe(401);
    expect(noCode.body.code).toBe('totp_required');
    expect(noCode.body.token).toBeUndefined();

    const wrong = await loginRaw(email, '123456' === hotp(secret, stepAt(Date.now())) ? '654321' : '123456');
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('totp_invalid');

    // The code used to enable cannot log in (replay); a later step's code can.
    const used = Number((await pool.query('SELECT totp_last_step FROM users WHERE email = $1', [email])).rows[0].totp_last_step);
    const reused = await loginRaw(email, hotp(secret, used));
    expect(reused.status).toBe(401);
    const next = hotp(secret, Math.max(used + 1, stepAt(Date.now())));
    const ok = await loginRaw(email, next);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect((await loginRaw(email, next)).status).toBe(401);
  });

  it('a wrong password with a valid code still gets the generic message', async () => {
    const res = await api().post('/api/auth/login').send({ email, password: 'Wrong-password-1', code: hotp(secret, stepAt(Date.now())) });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('disable needs the password and a code', async () => {
    const noPass = await api().post('/api/auth/totp/disable').set(auth(token)).send({ password: 'nope', code: hotp(secret, stepAt(Date.now())) });
    expect(noPass.status).toBe(400);
    const res = await api().post('/api/auth/totp/disable').set(auth(token)).send({ password: PASSWORD, code: hotp(secret, stepAt(Date.now())) });
    expect(res.status).toBe(200);
    expect(res.body.user.totpEnabled).toBe(false);
    expect((await loginRaw(email)).status).toBe(200);
  });

  it('five wrong codes lock the account like five wrong passwords', async () => {
    const e2 = 'pharmacie.romans@pharmacie.test';
    const t = (await loginRaw(e2)).body.token;
    const s = base32Decode((await api().post('/api/auth/totp/setup').set(auth(t))).body.secret);
    await api().post('/api/auth/totp/enable').set(auth(t)).send({ code: hotp(s, stepAt(Date.now())) });
    const good = new Set([-1, 0, 1].map((d) => hotp(s, stepAt(Date.now()) + d)));
    const wrong = ['000001', '000002', '000003', '000004', '000005', '000006'].filter((c) => !good.has(c)).slice(0, 5);
    for (const c of wrong) expect((await loginRaw(e2, c)).status).toBe(401);
    const locked = await loginRaw(e2, hotp(s, stepAt(Date.now()) + 1));
    expect(locked.status).toBe(401);
    expect(locked.body.error).toBe('Invalid email or password.');
  });
});
