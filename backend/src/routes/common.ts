import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db.js';
import { notFound } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { addRoutes } from '../openapi.js';
import { getShared } from '../services/orders.js';

/** Routes for every logged-in role, plus the public share link. */
export const commonRouter = Router();

commonRouter.get('/notifications', requireAuth, async (req, res) => {
  const items = await query(
    `SELECT id, kind, body, link, read_at AS "readAt", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
    [req.user!.id],
  );
  const unread = await query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [
    req.user!.id,
  ]);
  res.json({ items, unread: unread[0]?.n ?? 0 });
});

commonRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]);
  res.json({ ok: true });
});

commonRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const r = await pool.query('UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2', [
    id,
    req.user!.id,
  ]);
  if (!r.rowCount) throw notFound('Notification not found.');
  res.json({ ok: true });
});

commonRouter.post('/reports', requireAuth, async (req, res) => {
  const body = z.object({ subject: z.string().trim().min(3).max(120), message: z.string().trim().min(5).max(2000) }).parse(req.body);
  const r = await query<{ id: number }>('INSERT INTO reports (reporter_user_id, subject, message) VALUES ($1,$2,$3) RETURNING id', [
    req.user!.id,
    body.subject,
    body.message,
  ]);
  res.status(201).json({ id: r[0]!.id, message: 'Thank you. Our team will look at your report.' });
});

commonRouter.get('/share/:token', async (req, res) => {
  const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/, 'is not a valid link') }).parse(req.params);
  res.json({ order: await getShared(token) });
});

addRoutes([
  ['get', '/api/notifications', 'Common', 'My notifications with unread count', 'bearer'],
  ['post', '/api/notifications/:id/read', 'Common', 'Mark one as read', 'bearer'],
  ['post', '/api/notifications/read-all', 'Common', 'Mark all as read', 'bearer'],
  ['post', '/api/reports', 'Common', 'File a report (any logged-in user)', 'bearer'],
  ['get', '/api/share/:token', 'Common', 'Public tracking link (status only, expires 2 h after delivery)'],
]);
