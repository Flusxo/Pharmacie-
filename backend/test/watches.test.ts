import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { sentMails } from '../src/notify.js';
import { runStockWatchJob } from '../src/services/watches.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const MED = medicineId(0);

describe('notify me when it is back in stock', () => {
  it('a patient follows an unavailable medicine, is told once when a nearby pharmacy has it again, and the follow ends', async () => {
    await pool.query('UPDATE pharmacy_inventory SET quantity = 0 WHERE medicine_id = $1', [MED]);
    const t = await login('alice');
    expect((await api().post('/api/patient/watches').set(auth(t)).send({ medicineId: MED })).status).toBe(201);
    // Following twice changes nothing.
    expect((await api().post('/api/patient/watches').set(auth(t)).send({ medicineId: MED })).status).toBe(201);
    const list = await api().get('/api/patient/watches').set(auth(t));
    expect(list.body.items.map((i: { medicineId: string }) => i.medicineId)).toEqual([MED]);

    expect((await runStockWatchJob()).notified).toBe(0);
    await pool.query('UPDATE pharmacy_inventory SET quantity = 4 WHERE medicine_id = $1 AND pharmacy_id = $2', [MED, userId.pharmacy('tournon')]);
    sentMails.length = 0;
    expect((await runStockWatchJob()).notified).toBe(1);
    const notes = await api().get('/api/notifications').set(auth(t));
    const alert = notes.body.items.find((n: { kind: string }) => n.kind === 'stock_alert');
    expect(alert.link).toBe(`/medicines/${MED}`);
    expect(JSON.stringify(alert)).not.toMatch(/Doliprane/i);
    // Email follows the account's setting; its subject never names a medicine.
    expect(sentMails.some((m) => /available|disponible/i.test(m.subject) && !/doliprane/i.test(m.subject + m.body))).toBe(true);
    // One notice only: the follow is over.
    expect((await api().get('/api/patient/watches').set(auth(t))).body.items).toEqual([]);
    expect((await runStockWatchJob()).notified).toBe(0);
  });

  it('only patients can follow, and a medicine that does not exist is refused', async () => {
    const ph = await login('pharmacie.tournon');
    expect((await api().post('/api/patient/watches').set(auth(ph)).send({ medicineId: MED })).status).toBe(403);
    const t = await login('alice');
    expect((await api().post('/api/patient/watches').set(auth(t)).send({ medicineId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await api().delete(`/api/patient/watches/${MED}`).set(auth(t))).status).toBe(204);
  });
});
