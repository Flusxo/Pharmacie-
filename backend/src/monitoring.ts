import { config } from './config.js';
import { log } from './logger.js';

let lastSent = 0;

/**
 * Optional error alert: when ERROR_WEBHOOK_URL is set (a Discord, Slack or any webhook that takes {"text": "..."}),
 * one short message is posted for an unexpected server error, at most once a minute. The message holds the request id and
 * the path only: no body, no email, no medicine name. Without the variable nothing is sent and nothing else changes.
 */
export function reportServerError(info: { requestId?: string; path: string; code?: string }): void {
  const url = config.ERROR_WEBHOOK_URL;
  if (!url || Date.now() - lastSent < 60_000) return;
  lastSent = Date.now();
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `counter.: server error on ${info.path} (request ${info.requestId ?? 'n/a'}${info.code ? `, ${info.code}` : ''})`,
    }),
  }).catch((err: Error) => log('error', 'error_webhook_failed', { err: err.message }));
}

export const errorAlertsConfigured = (): boolean => !!config.ERROR_WEBHOOK_URL;
