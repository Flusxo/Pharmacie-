/** OpenAPI 3 description, generated from the route table below. Served at /api/docs. */
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Route = [Method, string, string, string, string?];

// [method, path, tag, summary, auth]
const ROUTES: Route[] = [
  ['get', '/api/health', 'System', 'Health check'],
  ['post', '/api/auth/register/patient', 'Auth', 'Register a patient (active)'],
  ['post', '/api/auth/register/doctor', 'Auth', 'Register a doctor (pending until verified)'],
  ['post', '/api/auth/register/pharmacy', 'Auth', 'Register a pharmacy (pending until verified)'],
  ['post', '/api/auth/login', 'Auth', 'Log in (all roles)'],
  ['get', '/api/auth/me', 'Auth', 'Current user', 'bearer'],
  ['get', '/api/admin/integrations', 'Admin', 'Which optional services are set up (booleans only)', 'bearer'],
  ['get', '/api/auth/sessions', 'Auth', 'My logged-in devices', 'bearer'],
  ['delete', '/api/auth/sessions/:id', 'Auth', 'Sign one device out', 'bearer'],
  ['post', '/api/auth/logout', 'Auth', 'Sign this device out (the token stops working at once)', 'bearer'],
  ['post', '/api/auth/logout-all', 'Auth', 'Sign out of every device', 'bearer'],
  ['patch', '/api/auth/me/preferences', 'Auth', 'Update email notification preference', 'bearer'],
  ['post', '/api/auth/forgot-password', 'Auth', 'Request a reset link (same answer for every email)'],
  ['post', '/api/auth/reset-password', 'Auth', 'Reset password with a single-use token (30 min)'],
  ['post', '/api/auth/change-password', 'Auth', 'Change password', 'bearer'],
  ['post', '/api/auth/totp/setup', 'Auth', 'Two-step verification: create a secret (doctor, pharmacy, staff)', 'bearer'],
  ['post', '/api/auth/totp/enable', 'Auth', 'Two-step verification: turn on with a code', 'bearer'],
  ['post', '/api/auth/totp/disable', 'Auth', 'Two-step verification: turn off (password + code)', 'bearer'],
];

export function addRoutes(routes: Route[]): void {
  ROUTES.push(...routes);
}

export function openapiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, tag, summary, auth] of ROUTES) {
    const oaPath = path.replace(/:(\w+)/g, '{$1}');
    const params = [...path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    paths[oaPath] ??= {};
    paths[oaPath][method] = {
      tags: [tag],
      summary,
      ...(params.length ? { parameters: params } : {}),
      ...(auth ? { security: [{ bearer: [] }] } : {}),
      responses: { '200': { description: 'OK' }, '400': { description: 'Invalid input (clear message)' } },
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'PharmaLink (counter.) API', version: '0.1.0', description: 'Prototype only. Not for real medical use. Demo data.' },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
