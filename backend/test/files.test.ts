import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';
import { pool } from '../src/db.js';
import { runFileCleanupJob } from '../src/services/files.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const DOLIPRANE = medicineId(0);
const TOURNON = userId.pharmacy('tournon');

// Real file signatures (enough for the type check): a PNG, a JPEG and a PDF.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);

const upload = (path: string, token: string, body: Buffer | string, type: string, name = 'ordonnance.png') =>
  api().post(path).set(auth(token)).set('Content-Type', type).set('X-Filename', encodeURIComponent(name)).send(body);

async function requestOf(patient: string) {
  await pool.query(`UPDATE requests SET created_at = created_at - interval '3 minutes' WHERE patient_id = $1`, [userId.patient(patient)]);
  const t = await login(patient);
  const r = await api()
    .post('/api/patient/requests')
    .set(auth(t))
    .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
  expect(r.status).toBe(201);
  return { id: r.body.id as string, token: t };
}

describe('prescription files: checks on upload', () => {
  it('accepts a real PNG, JPEG or PDF and refuses anything else, whatever its declared type', async () => {
    const { id, token } = await requestOf('alice');
    const url = `/api/patient/requests/${id}/files`;
    expect((await upload(url, token, PNG, 'image/png')).status).toBe(201);
    expect((await upload(url, token, JPEG, 'image/jpeg', 'photo.jpg')).status).toBe(201);
    // Text sent as a PNG, a PDF sent as a PNG, an empty body, and a type that is not allowed.
    expect((await upload(url, token, Buffer.from('this is not an image at all'), 'image/png')).status).toBe(415);
    expect((await upload(url, token, PDF, 'image/png')).status).toBe(415);
    expect((await upload(url, token, 'plain text', 'text/plain')).status).toBe(415);
    expect((await upload(url, token, Buffer.alloc(0), 'image/png')).status).toBe(415);
    // Over 2 MB.
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(url, token, big, 'image/png')).status).toBe(413);
    // The file name is cleaned: no path, no odd characters.
    const named = await upload(url, token, PDF, 'application/pdf', '..\\..\\etc/<script>passwd');
    expect(named.status).toBe(201);
    expect(named.body.filename).not.toMatch(/[\\/<>]/);
    // At most 3 per request.
    const fourth = await upload(url, token, PNG, 'image/png');
    expect(fourth.status).toBe(409);
    const list = await api().get(url).set(auth(token));
    expect(list.body.items).toHaveLength(3);
  });
});

describe('prescription files: who can open them', () => {
  it('only the patient and the pharmacy the patient chose; nobody else, not even staff or a linked doctor', async () => {
    const { id, token } = await requestOf('bruno');
    const up = await upload(`/api/patient/requests/${id}/files`, token, PNG, 'image/png');
    expect(up.status).toBe(201);
    const fileId = up.body.id as string;
    const open = async (who: string) => (await api().get(`/api/files/${fileId}`).set(auth(await login(who)))).status;

    expect(await open('bruno')).toBe(200);
    // No pharmacy has been chosen yet: not even Tournon.
    expect(await open('pharmacie.tournon')).toBe(404);
    expect((await api().post(`/api/patient/requests/${id}/choose`).set(auth(token)).send({ pharmacyId: TOURNON })).status).toBe(200);

    expect(await open('pharmacie.tournon')).toBe(200);
    expect(await open('pharmacie.valence')).toBe(404); // another pharmacy
    expect(await open('alice')).toBe(404); // another patient
    expect(await open('dr.martin')).toBe(404); // a doctor linked to the patient
    expect(await open('admin')).toBe(404); // staff do not read prescriptions
    expect((await api().get(`/api/files/${fileId}`)).status).toBe(401);

    // A team member of the chosen pharmacy opens it as the pharmacy.
    const owner = await login('pharmacie.tournon');
    await api().post('/api/pharmacy/team').set(auth(owner)).send({ email: 'rx@files.test', displayName: 'Rx', password: PASSWORD, role: 'pharmacist' });
    const member = (await api().post('/api/auth/login').send({ email: 'rx@files.test', password: PASSWORD })).body.token as string;
    expect((await api().get(`/api/files/${fileId}`).set(auth(member))).status).toBe(200);

    // The response is never cached and never run as a page.
    const res = await api().get(`/api/files/${fileId}`).set(auth(owner));
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);

    // Lists follow the same rule.
    expect((await api().get(`/api/pharmacy/requests/${id}/files`).set(auth(owner))).body.items).toHaveLength(1);
    expect((await api().get(`/api/pharmacy/requests/${id}/files`).set(auth(await login('pharmacie.valence')))).status).toBe(404);
    expect((await api().get(`/api/patient/requests/${id}/files`).set(auth(await login('alice')))).status).toBe(404);
    // Only the owner removes a file.
    expect((await api().delete(`/api/patient/files/${fileId}`).set(auth(await login('alice')))).status).toBe(404);
    expect((await api().delete(`/api/patient/files/${fileId}`).set(auth(token))).status).toBe(204);
    expect(await open('pharmacie.tournon')).toBe(404);
  });

  it('only a patient can attach a file to a request, and only to their own', async () => {
    const { id } = await requestOf('camille');
    expect((await upload(`/api/patient/requests/${id}/files`, await login('alice'), PNG, 'image/png')).status).toBe(404);
    expect((await upload(`/api/patient/requests/${id}/files`, await login('pharmacie.tournon'), PNG, 'image/png')).status).toBe(403);
  });
});

describe('prescription files: deleted when no longer needed', () => {
  it('expired files go; a prescription goes 48 hours after its order is delivered; deleting the account removes them', async () => {
    const { id, token } = await requestOf('david');
    const keep = (await upload(`/api/patient/requests/${id}/files`, token, PNG, 'image/png')).body.id as string;
    const old = (await upload(`/api/patient/requests/${id}/files`, token, JPEG, 'image/jpeg')).body.id as string;
    await pool.query(`UPDATE private_files SET expires_at = now() - interval '1 minute' WHERE id = $1`, [old]);
    await runFileCleanupJob();
    const left = await pool.query('SELECT id FROM private_files WHERE request_id = $1', [id]);
    expect(left.rows.map((r) => r.id)).toEqual([keep]);
    // The request ends (cancelled) and 48 hours pass.
    await pool.query(`UPDATE requests SET status = 'cancelled', updated_at = now() - interval '49 hours' WHERE id = $1`, [id]);
    expect((await runFileCleanupJob()).deleted).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT 1 FROM private_files WHERE request_id = $1', [id])).rowCount).toBe(0);

    // Account deletion.
    const reg = await api()
      .post('/api/auth/register/patient')
      .send({ email: 'gone@files.test', password: 'LongEnough123', firstName: 'Gaëlle', lastName: 'Partie', address: '1 rue X' });
    const t = reg.body.token as string;
    const created = await api()
      .post('/api/patient/requests')
      .set(auth(t))
      .send({ items: [{ medicineId: DOLIPRANE, quantity: 1 }] });
    await upload(`/api/patient/requests/${created.body.id}/files`, t, PNG, 'image/png');
    expect((await pool.query('SELECT 1 FROM private_files WHERE owner_user_id = $1', [reg.body.user.id])).rowCount).toBe(1);
    await api().delete('/api/patient/account').set(auth(t)).send({ password: 'LongEnough123' });
    expect((await pool.query('SELECT 1 FROM private_files WHERE owner_user_id = $1', [reg.body.user.id])).rowCount).toBe(0);
  });
});

describe('verification documents', () => {
  it('an applicant sends them, staff open them (and it is logged), nobody else can', async () => {
    const applicant = await login('dr.bernard'); // a doctor waiting for verification
    const me = await api().get('/api/auth/me').set(auth(applicant));
    const up = await upload('/api/me/verification-files', applicant, PDF, 'application/pdf', 'carte-rpps.pdf');
    expect(up.status).toBe(201);
    const fileId = up.body.id as string;

    const admin = await login('admin');
    const list = await api().get(`/api/admin/users/${me.body.user.id}/files`).set(auth(admin));
    expect(list.body.items.map((f: { id: string }) => f.id)).toEqual([fileId]);
    expect((await api().get(`/api/files/${fileId}`).set(auth(admin))).status).toBe(200);
    const audit = await pool.query("SELECT 1 FROM audit_log WHERE action = 'view_verification_file' AND target = $1", [fileId]);
    expect(audit.rowCount).toBe(1);
    expect((await api().get(`/api/files/${fileId}`).set(auth(applicant))).status).toBe(200);

    expect((await api().get(`/api/files/${fileId}`).set(auth(await login('dr.martin')))).status).toBe(404);
    expect((await api().get(`/api/files/${fileId}`).set(auth(await login('alice')))).status).toBe(404);
    expect((await api().get(`/api/files/${fileId}`).set(auth(await login('pharmacie.tournon')))).status).toBe(404);
    // Patients do not send verification documents; another account cannot remove them.
    expect((await upload('/api/me/verification-files', await login('alice'), PDF, 'application/pdf')).status).toBe(403);
    expect((await api().delete(`/api/me/verification-files/${fileId}`).set(auth(await login('dr.martin')))).status).toBe(404);
    expect((await api().delete(`/api/me/verification-files/${fileId}`).set(auth(applicant))).status).toBe(204);
  });
});
