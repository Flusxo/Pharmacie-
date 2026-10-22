import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { isTest } from '../config.js';
import { one } from '../db.js';
import { langOf } from '../i18n/index.js';
import { log, maskEmail } from '../logger.js';
import { addRoutes } from '../openapi.js';
import { emailField } from '../validate.js';

/** Public Contact page: messages are stored for staff (no email is sent in the prototype). */
export const contactRouter = Router();

const contactLimiter = rateLimit({
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  windowMs: 60 * 60_000,
  limit: 10,
  message: { error: 'Too many messages from this network. Please try again later.' },
});

export const TOPICS = ['patient', 'pharmacy', 'doctor', 'press', 'other'] as const;

contactRouter.post('/contact', contactLimiter, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2, 'is required').max(80, 'is too long'),
      email: emailField,
      topic: z.enum(TOPICS),
      subject: z.string().trim().min(3, 'must be at least 3 characters').max(120, 'is too long'),
      message: z.string().trim().min(10, 'must be at least 10 characters').max(2000, 'is too long'),
      // The form asks the sender to confirm they are not sending health data.
      noHealthData: z.literal(true, { error: 'please confirm that you are not sending health data' }),
      // Honeypot field, hidden from people: bots fill it.
      website: z.string().max(0, 'must be empty').optional(),
    })
    .parse(req.body);
  const row = await one<{ id: string }>(
    'INSERT INTO contact_messages (name, email, topic, subject, message, language) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [body.name, body.email, body.topic, body.subject, body.message, langOf(req)],
  );
  log('info', 'contact_message', { id: row!.id, from: maskEmail(body.email), topic: body.topic });
  res.status(201).json({ id: row!.id, message: 'Thank you. Your message has been sent to our team.' });
});

addRoutes([['post', '/api/contact', 'Public', 'Contact form (stored for staff; rate limited; no health data)']]);
