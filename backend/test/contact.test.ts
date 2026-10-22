import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';

beforeAll(freshDb);

const valid = {
  name: 'Jeanne Test',
  email: 'Jeanne.Test@Example.com',
  topic: 'pharmacy',
  subject: 'Question',
  message: 'Bonjour, comment rejoindre la plateforme ?',
  noHealthData: true,
};

describe('contact form', () => {
  it('stores a valid message for staff (no login needed)', async () => {
    const res = await api().post('/api/contact').set('Accept-Language', 'fr').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Merci. Votre message a été transmis à notre équipe.');
    const row = await pool.query('SELECT email, language, handled_at FROM contact_messages WHERE id = $1', [res.body.id]);
    expect(row.rows[0]).toMatchObject({ email: 'jeanne.test@example.com', language: 'fr', handled_at: null });
  });

  it('refuses invalid input with clear messages', async () => {
    const res = await api()
      .post('/api/contact')
      .send({ ...valid, email: 'nope', message: 'short', topic: 'spam', noHealthData: false });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'message', 'topic', 'noHealthData']));
    expect(res.body.error).toContain('message: must be at least 10 characters');
    expect(res.body.error).toContain('please confirm that you are not sending health data');
  });

  it('a filled honeypot field is refused', async () => {
    const res = await api()
      .post('/api/contact')
      .send({ ...valid, website: 'http://spam.example' });
    expect(res.status).toBe(400);
  });

  it('staff see the messages, mark one handled (audited); patients cannot', async () => {
    const support = await login('support');
    const list = await api().get('/api/admin/contact-messages?status=open').set(auth(support));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(3);
    const target = list.body.items.find((m: { subject: string }) => m.subject === 'Question');
    const stats = await api().get('/api/admin/stats').set(auth(support));
    const before = stats.body.openContactMessages;
    expect((await api().post(`/api/admin/contact-messages/${target.id}/handle`).set(auth(support))).status).toBe(200);
    expect((await api().post(`/api/admin/contact-messages/${target.id}/handle`).set(auth(support))).status).toBe(404);
    expect((await api().get('/api/admin/stats').set(auth(support))).body.openContactMessages).toBe(before - 1);
    const handled = await api().get('/api/admin/contact-messages?status=handled').set(auth(support));
    expect(handled.body.items[0]).toMatchObject({ id: target.id, handledBy: 'support@pharmacie.test' });
    const auditRow = await pool.query("SELECT 1 FROM audit_log WHERE action = 'handle_contact_message' AND target = $1", [
      `contact:${target.id}`,
    ]);
    expect(auditRow.rowCount).toBe(1);
    const alice = await login('alice');
    expect((await api().get('/api/admin/contact-messages').set(auth(alice))).status).toBe(403);
  });
});
