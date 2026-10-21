import { z } from 'zod';
import { RULES } from './config.js';

export const uuid = z.uuid({ message: 'must be a valid identifier' });
export const idParam = z.object({ id: uuid });
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'must be a valid email address' }));
export const passwordField = z
  .string()
  .min(RULES.MIN_PASSWORD, `must be at least ${RULES.MIN_PASSWORD} characters`)
  .max(200, 'is too long');
export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);
export const reasonField = z.string().trim().min(3, 'a reason is required (at least 3 characters)').max(500);
export const page = z.coerce.number().int().min(1).max(1000).default(1);
