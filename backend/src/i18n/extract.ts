/**
 * Finds every user-facing message literal in the backend source (errors, notifications, API messages,
 * validation messages). Used by the test that checks each one has a French translation.
 * Template parts `${…}` become `{…}` placeholders, matching the catalogue format.
 */
import fs from 'node:fs';
import path from 'node:path';

const LITERAL = String.raw`(\x60(?:[^\x60\\]|\\.)*\x60|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
const PATTERNS = [
  // badRequest('…'), conflict('…'), forbidden('…'), notFound('…'), unauthorized('…')
  new RegExp(String.raw`\b(?:badRequest|conflict|forbidden|notFound|unauthorized)\(\s*` + LITERAL, 'g'),
  // new HttpError(401, '…')
  new RegExp(String.raw`\bHttpError\(\s*\d+\s*,\s*` + LITERAL, 'g'),
  // notify(user, 'kind', '…')
  new RegExp(String.raw`\bnotify\(\s*[^,]+,\s*'[a-z_]+'\s*,\s*` + LITERAL, 'g'),
  // { error: '…' } / { message: '…' }
  new RegExp(String.raw`\b(?:error|message)\s*:\s*` + LITERAL, 'g'),
  // error = '…' (row errors in lists, e.g. the CSV preview)
  new RegExp(String.raw`\berror\s*=\s*` + LITERAL, 'g'),
  // zod: .min(1, '…'), .regex(/x/, '…'), .refine(fn, '…'), .max(…, '…')
  new RegExp(
    String.raw`\.(?:min|max|regex|length|refine|nonnegative|positive|int)\([^()]*?(?:\([^()]*\)[^()]*?)*,\s*` + LITERAL + String.raw`\s*\)`,
    'g',
  ),
];

const toTemplate = (lit: string) =>
  lit
    .slice(1, -1)
    .replace(/\$\{([^}]*)\}/g, (_, expr: string) => `{${expr.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x'}}`)
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n');

export function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'i18n' ? [] : sourceFiles(p);
    return d.name.endsWith('.ts') ? [p] : [];
  });
}

/** Unique messages with the files they come from. */
export function extractMessages(srcDir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of sourceFiles(srcDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) {
        const msg = toTemplate(m[1]);
        // Only human sentences (letters and a space), not codes such as 'not_found'.
        if (!/[A-Za-z]{2,}.*\s/.test(msg) && !/^(is|must)\b/.test(msg)) continue;
        out.set(msg, [...(out.get(msg) ?? []), path.basename(file)]);
      }
    }
  }
  return out;
}
