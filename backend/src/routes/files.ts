import express, { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { forbidden } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { addRoutes } from '../openapi.js';
import {
  ALLOWED_TYPES,
  MAX_FILE_BYTES,
  cleanFilename,
  deleteOwnFile,
  listVerificationFiles,
  readBody,
  readFile,
  saveVerification,
} from '../services/files.js';
import { idParam } from '../validate.js';

/** Download of a private file, and the applicant's own verification documents. */
export const filesRouter = Router();

/** At most 10 messages a minute per person (the pharmacy side counts per team member). */
export const messageLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.MESSAGE_RATE_LIMIT ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.actorId ?? req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: 'Too many messages. Please wait a minute.', code: 'rate_limited' },
});

/** The raw body parser for uploads: JPEG, PNG, WebP or PDF, at most 2 MB (a larger body is refused with 413). */
export const rawUpload = express.raw({ type: [...ALLOWED_TYPES], limit: MAX_FILE_BYTES });

filesRouter.get('/files/:id', requireAuth, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const u = req.user!;
  const f = await readFile(id, u, u.role === 'pharmacy' ? (u.pharmacyId ?? u.id) : null);
  res.setHeader('Content-Type', f.content_type);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
  // Never stored by a browser or a proxy; never run as a page.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.send(f.data);
});

/** Applicants (doctor or pharmacy owner) send documents for staff to check. */
function applicantOnly(role: string, pharmacyMember: boolean): void {
  if ((role !== 'doctor' && role !== 'pharmacy') || pharmacyMember) throw forbidden();
}

filesRouter.get('/me/verification-files', requireAuth, async (req, res) => {
  applicantOnly(req.user!.role, !!req.user!.pharmacyId);
  res.json({ items: await listVerificationFiles(req.user!.id) });
});

filesRouter.post('/me/verification-files', requireAuth, rawUpload, async (req, res) => {
  applicantOnly(req.user!.role, !!req.user!.pharmacyId);
  const { buf, type } = readBody(req.body, req.headers['content-type']);
  const name = cleanFilename(req.header('x-filename'), type);
  res.status(201).json(await saveVerification(req.user!.id, name, buf, type));
});

filesRouter.delete('/me/verification-files/:id', requireAuth, async (req, res) => {
  applicantOnly(req.user!.role, !!req.user!.pharmacyId);
  const { id } = idParam.parse(req.params);
  await deleteOwnFile(id, req.user!.id, 'verification');
  res.status(204).end();
});

addRoutes([
  [
    'get',
    '/api/files/:id',
    'Files',
    'Download a private file (its owner, the chosen pharmacy for a prescription, staff for a verification document)',
    'bearer',
  ],
  ['get', '/api/me/verification-files', 'Files', 'My verification documents (doctor or pharmacy)', 'bearer'],
  [
    'post',
    '/api/me/verification-files',
    'Files',
    'Send a verification document (raw JPEG, PNG, WebP or PDF, at most 2 MB; X-Filename header)',
    'bearer',
  ],
  ['delete', '/api/me/verification-files/:id', 'Files', 'Remove one of my verification documents', 'bearer'],
]);
