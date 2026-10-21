import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDatabase, testDatabaseUrl } from '../../db/src/index.js';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Password123!';

/** Each test file starts from a fresh, deterministic seed. */
export const freshDb = () => resetDatabase(testDatabaseUrl());

const tokens = new Map<string, string>();
export async function login(email: string): Promise<string> {
  const full = email.includes('@') ? email : `${email}@pharmacie.test`;
  const cached = tokens.get(full);
  if (cached) return cached;
  const res = await api().post('/api/auth/login').send({ email: full, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${full} failed: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(full, res.body.token);
  return res.body.token as string;
}
export const clearTokens = () => tokens.clear();
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
