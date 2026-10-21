import fs from 'node:fs';
import path from 'node:path';
import { ROOT, isTest } from './config.js';
import { one, pool, type Db } from './db.js';
import { log, maskEmail } from './logger.js';

export type NotificationKind =
  | 'request_sent'
  | 'request_received'
  | 'request_accepted'
  | 'request_refused'
  | 'request_expired'
  | 'order_status'
  | 'doctor_link'
  | 'account_verified'
  | 'account_rejected'
  | 'substitution'
  | 'cancel_request'
  | 'password_reset';

/** Neutral subjects: never contain medicine names. */
const SUBJECTS: Record<NotificationKind, string> = {
  request_sent: 'Update on your request',
  request_received: 'New request on counter.',
  request_accepted: 'Update on your request',
  request_refused: 'Update on your request',
  request_expired: 'Update on your request',
  order_status: 'Update on your request',
  doctor_link: 'A doctor would like to link to your account',
  account_verified: 'Your account has been verified',
  account_rejected: 'Update on your account',
  substitution: 'Update on your request',
  cancel_request: 'Update on an order',
  password_reset: 'Reset your password',
};

export interface SentMail {
  to: string;
  subject: string;
  body: string;
  at: string;
}
/** In tests, mails are kept in memory for assertions. */
export const sentMails: SentMail[] = [];

const MAIL_LOG = path.join(ROOT, 'logs', 'mail.log');

/** Mock email service: writes to logs/mail.log in development. TODO(out of scope): real email provider. */
export function sendMail(to: string, subject: string, body: string): void {
  const mail = { to, subject, body, at: new Date().toISOString() };
  if (isTest) {
    sentMails.push(mail);
    return;
  }
  fs.mkdirSync(path.dirname(MAIL_LOG), { recursive: true });
  fs.appendFileSync(MAIL_LOG, JSON.stringify(mail) + '\n');
  log('info', 'mail_sent', { to: maskEmail(to), subject });
}

/** In-app notification + (if the user allows it) a mock email. */
export async function notify(
  userId: string,
  kind: NotificationKind,
  body: string,
  link: string | null = null,
  db: Db = pool,
): Promise<void> {
  await db.query('INSERT INTO notifications (user_id, kind, body, link) VALUES ($1,$2,$3,$4)', [userId, kind, body, link]);
  const u = await one<{ email: string; email_notifications: boolean }>(
    'SELECT email, email_notifications FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
    db,
  );
  if (u?.email_notifications) {
    sendMail(u.email, SUBJECTS[kind], `${body}\n\nOpen counter. to see the details${link ? `: ${link}` : '.'}`);
  }
}
