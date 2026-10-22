import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { log } from './logger.js';
import { fieldName, issueMessage, langOf } from './i18n/index.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, 'bad_request', details);
export const unauthorized = (m = 'Please log in.') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this.') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found.') => new HttpError(404, m, 'not_found');
export const conflict = (m: string, code = 'conflict') => new HttpError(409, m, code);

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No API route for ${req.method} ${req.path}` });
}

// Express recognises error handlers by their 4 arguments.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId as string | undefined;
  if (err instanceof ZodError) {
    const lang = langOf(req);
    const details = err.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: issueMessage(i, lang) }));
    const summary = details.map((d) => `${fieldName(d.field, lang)}${lang === 'fr' ? ' :' : ':'} ${d.message}`).join('; ');
    res.status(400).json({ error: `Invalid input — ${summary}`, details, requestId });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details, requestId });
    return;
  }
  const e = err as { code?: string; type?: string; status?: number; message?: string };
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON.', requestId });
    return;
  }
  if (e.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large.', requestId });
    return;
  }
  if (e.code === '23505') {
    res.status(409).json({ error: 'This already exists.', requestId });
    return;
  }
  if (e.code === '22P02') {
    res.status(400).json({ error: 'Invalid identifier format.', requestId });
    return;
  }
  if (e.code === '23514') {
    res.status(409).json({ error: 'This change would break a data rule (for example, stock below zero).', requestId });
    return;
  }
  if (e.code === 'ECONNREFUSED' || e.code === '57P03' || e.code === '3D000') {
    log('error', 'database_unavailable', { requestId, code: e.code });
    res.status(503).json({
      error: 'The database is not reachable. Start it with `npm run dev` (or `npm run db:reset`) and try again.',
      requestId,
    });
    return;
  }
  log('error', 'unhandled_error', { requestId, path: req.path, err: e.message, code: e.code });
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', requestId });
}
