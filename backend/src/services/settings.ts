import type { NextFunction, Request, Response } from 'express';
import { query, tx } from '../db.js';
import { HttpError } from '../errors.js';

/**
 * Feature switches. An admin can switch a feature off (and on again) without a new deployment: when it is off, the screens
 * hide it and the API refuses new actions with a clear message (reading what already exists keeps working). Every change is
 * written to the audit log with a reason.
 */
export const FLAGS = ['messages', 'reviews', 'uploads', 'slots', 'signups'] as const;
export type Flag = (typeof FLAGS)[number];

let cache: { at: number; flags: Record<Flag, boolean> } | null = null;
const TTL_MS = 5_000;

export async function getFlags(): Promise<Record<Flag, boolean>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;
  const rows = await query<{ key: string; value: { on?: boolean } }>("SELECT key, value FROM app_settings WHERE key LIKE 'flag:%'");
  const flags = Object.fromEntries(FLAGS.map((f) => [f, rows.find((r) => r.key === `flag:${f}`)?.value.on !== false])) as Record<
    Flag,
    boolean
  >;
  cache = { at: Date.now(), flags };
  return flags;
}

export async function listFlagDetails() {
  const flags = await getFlags();
  const rows = await query<{ key: string; updated_at: string; email: string | null }>(
    `SELECT s.key, s.updated_at, u.email FROM app_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.key LIKE 'flag:%'`,
  );
  return FLAGS.map((f) => {
    const r = rows.find((x) => x.key === `flag:${f}`);
    return { name: f, on: flags[f], updatedAt: r?.updated_at ?? null, updatedBy: r?.email ?? null };
  });
}

export async function setFlag(name: Flag, on: boolean, actorId: string, reason: string): Promise<void> {
  await tx(async (c) => {
    await c.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [`flag:${name}`, JSON.stringify({ on }), actorId],
    );
    await c.query('INSERT INTO audit_log (actor_user_id, action, target, reason) VALUES ($1,$2,$3,$4)', [
      actorId,
      on ? 'feature_on' : 'feature_off',
      name,
      reason,
    ]);
  });
  cache = null;
}

/** Route guard: refuses with 503 while the feature is switched off. */
export const requireFeature =
  (name: Flag, message = 'This feature is switched off for now.') =>
  async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!(await getFlags())[name]) throw new HttpError(503, message, 'feature_off');
    next();
  };

/** Used by tests that change the switches directly. */
export const clearFlagCache = () => {
  cache = null;
};
