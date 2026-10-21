import { isTest } from './config.js';

/** Masks an email: "alice@pharmacie.test" -> "a***@pharmacie.test". */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

type Level = 'info' | 'warn' | 'error';

/**
 * Structured JSON logs. Never pass medicine names, addresses or full emails here.
 */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (isTest && level === 'info') return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}
