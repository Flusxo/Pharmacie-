/**
 * Server-side translation. Messages are written in English in the code; `tr()` returns the French
 * version from the catalogue (`messages.ts`), keeping the variable parts. The request language comes
 * from `Accept-Language` (the web app always sends the UI language); default English for API clients.
 */
import type { Request } from 'express';
import { z } from 'zod';
import { FR, FR_FIELDS, FR_VALUES } from './messages.js';

export type Lang = 'fr' | 'en';

export function langOf(req: Pick<Request, 'headers'>): Lang {
  const first = String(req.headers['accept-language'] ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return first.startsWith('fr') ? 'fr' : 'en';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Templates with variable parts, most specific (longest fixed text) first. */
const TEMPLATES = Object.entries(FR)
  .filter(([en]) => /\{\w+\}/.test(en))
  .map(([en, fr]) => {
    const names = [...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const pattern = escapeRe(en).replace(/\\\{\w+\\\}/g, '(.+?)');
    return { re: new RegExp(`^${pattern}$`, 's'), names, fr, fixed: en.replace(/\{\w+\}/g, '').length };
  })
  .sort((a, b) => b.fixed - a.fixed);

/** Translates one message (or a value inside a message); unknown text is returned unchanged. */
export function tr(message: string, lang: Lang): string {
  if (lang === 'en' || !message) return message;
  const exact = FR[message] ?? FR_VALUES[message];
  if (exact) return exact;
  for (const t of TEMPLATES) {
    const m = t.re.exec(message);
    if (!m) continue;
    let out = t.fr;
    t.names.forEach((name, i) => {
      const value = m[i + 1];
      out = out.split(`{${name}}`).join(FR_VALUES[value] ?? FR[value] ?? value);
    });
    return out;
  }
  return message;
}

const frZod = z.locales.fr().localeError as unknown as (issue: z.core.$ZodIssue) => string | { message: string } | undefined;

/** A validation issue in the request language: our own messages via the catalogue, zod defaults via its French locale. */
export function issueMessage(issue: z.core.$ZodIssue, lang: Lang): string {
  if (lang === 'en') return issue.message;
  if (FR[issue.message] || TEMPLATES.some((t) => t.re.test(issue.message))) return tr(issue.message, lang);
  const out = frZod(issue);
  return (typeof out === 'string' ? out : out?.message) ?? issue.message;
}

export const fieldName = (field: string, lang: Lang) => (lang === 'fr' ? (FR_FIELDS[field] ?? field) : field);
