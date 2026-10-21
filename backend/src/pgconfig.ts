import type pg from 'pg';

const SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);

/**
 * Turns DATABASE_URL into a pg config. When the URL says sslmode=require (Neon and most hosted
 * PostgreSQL), the connection uses TLS with certificate verification. The sslmode parameter is
 * removed from the string so pg does not override the explicit `ssl` option.
 * Keep in sync with db/src/pgconfig.ts.
 */
export function pgConfig(url: string): pg.ClientConfig {
  const u = new URL(url);
  const mode = u.searchParams.get('sslmode');
  if (!mode || !SSL_MODES.has(mode)) return { connectionString: url };
  u.searchParams.delete('sslmode');
  // channel_binding is negotiated by pg itself; the URL parameter is not understood.
  u.searchParams.delete('channel_binding');
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: true } };
}
