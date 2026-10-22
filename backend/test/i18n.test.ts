import path from 'node:path';
import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login, PASSWORD } from './helpers.js';
import { extractMessages } from '../src/i18n/extract.js';
import { DEV_ONLY, FR } from '../src/i18n/messages.js';
import { tr } from '../src/i18n/index.js';

beforeAll(freshDb);

const SRC = path.resolve(__dirname, '../src');
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('API messages in French and English', () => {
  it('every user-facing message in the backend source has a French version', () => {
    const found = extractMessages(SRC);
    expect(found.size).toBeGreaterThan(100);
    const missing = [...found.keys()].filter((m) => !DEV_ONLY.has(m) && !FR[m]);
    expect(missing, `add these to src/i18n/messages.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('email subjects are translated too', () => {
    const notify = fs.readFileSync(path.join(SRC, 'notify.ts'), 'utf8');
    const subjects = [...notify.matchAll(/^\s+[a-z_]+: '([^']+)',$/gm)].map((m) => m[1]);
    expect(subjects.length).toBeGreaterThan(5);
    for (const s of subjects) expect(FR[s], s).toBeTruthy();
  });

  it('French versions keep the same {placeholders} and are not left in English', () => {
    for (const [en, fr] of Object.entries(FR)) {
      expect(vars(fr), en).toEqual(vars(en));
      if (en.split(' ').length > 3) expect(fr, en).not.toBe(en);
    }
  });

  it('translates messages with variable parts, including known values', () => {
    expect(tr('Your request was sent to Pharmacie du Rhône.', 'fr')).toBe('Votre demande a été envoyée à Pharmacie du Rhône.');
    expect(tr('Update on your request: your order is being prepared.', 'fr')).toBe(
      'Votre demande a évolué : votre commande est en préparation.',
    );
    expect(tr('The pharmacy accepted your request.', 'fr')).toBe('La pharmacie a accepté votre demande.');
    expect(tr('Something new', 'fr')).toBe('Something new');
    expect(tr('Order not found.', 'en')).toBe('Order not found.');
  });

  it('answers in the language of Accept-Language (default English)', async () => {
    const body = { email: 'alice@pharmacie.test', password: 'wrong-password' };
    const en = await api().post('/api/auth/login').send(body);
    expect(en.body.error).toBe('Invalid email or password.');
    const fr = await api().post('/api/auth/login').set('Accept-Language', 'fr-FR,fr;q=0.9').send(body);
    expect(fr.body.error).toBe('E-mail ou mot de passe incorrect.');
    expect(fr.headers['content-language']).toBe('fr');
  });

  it('validation messages are translated, field names included', async () => {
    const fr = await api().post('/api/auth/register/patient').set('Accept-Language', 'fr').send({ email: 'nope', password: 'x' });
    expect(fr.status).toBe(400);
    expect(fr.body.error).toMatch(/^Saisie invalide — /);
    expect(fr.body.error).toContain('e-mail : doit être une adresse e-mail valide');
    expect(fr.body.error).toContain('mot de passe : doit contenir au moins');
    expect(fr.body.error).toContain('prénom : ');
    const en = await api().post('/api/auth/register/patient').send({ email: 'nope', password: 'x' });
    expect(en.body.error).toMatch(/^Invalid input — email: must be a valid email address/);
  });

  it("notifications are shown in the reader's language", async () => {
    const t = await login('alice');
    const fr = await api().get('/api/notifications').set(auth(t)).set('Accept-Language', 'fr');
    const en = await api().get('/api/notifications').set(auth(t));
    expect(fr.body.items.length).toBeGreaterThan(0);
    expect(fr.body.items.length).toBe(en.body.items.length);
    expect(fr.body.items.some((n: { body: string }, i: number) => n.body !== en.body.items[i].body)).toBe(true);
  });

  it('the account remembers the language, and emails use it', async () => {
    const t = await login('bruno');
    const res = await api().patch('/api/auth/me/preferences').set(auth(t)).send({ language: 'en' });
    expect(res.body.user.language).toBe('en');
    expect((await api().get('/api/auth/me').set(auth(t))).body.user.language).toBe('en');
    const bad = await api().patch('/api/auth/me/preferences').set(auth(t)).send({ language: 'de' });
    expect(bad.status).toBe(400);
    await api().patch('/api/auth/me/preferences').set(auth(t)).send({ language: 'fr' });
    // New accounts take the language of the sign-up page.
    const reg = await api()
      .post('/api/auth/register/patient')
      .set('Accept-Language', 'en')
      .send({ email: 'lang.test@example.test', password: PASSWORD, firstName: 'Lou', lastName: 'Test' });
    expect(reg.body.user.language).toBe('en');
  });

  it('medicines come with English texts', async () => {
    const r = await api().get('/api/medicines?q=doliprane');
    const m = r.body.items[0];
    expect(m.description).toMatch(/Antalgique/);
    expect(m.descriptionEn).toMatch(/Pain reliever/);
    expect(m.ageNoteEn).toMatch(/Adults/);
  });
});
