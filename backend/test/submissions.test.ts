import { beforeAll, describe, expect, it } from 'vitest';
import { api, auth, freshDb, login } from './helpers.js';
import { pool } from '../src/db.js';
import { medicineId, userId } from '../../db/src/index.js';

beforeAll(freshDb);

const as = async (who: string) => auth(await login(who));
const TOURNON = userId.pharmacy('tournon');

const NEW_MEDICINE = {
  cip13: '3400999000011',
  name: 'Zorbexil Test',
  activeSubstance: 'zorbexine',
  form: 'tablet',
  dosage: '250 mg',
  category: 'pain',
  requiresPrescription: false,
  stock: { quantity: 12, priceEur: 4.5 },
};

describe('pharmacies propose medicines that are not in the catalogue', () => {
  it('stores a pending proposal with its first stock, an audit entry, and hides it from patients and search', async () => {
    const res = await api()
      .post('/api/pharmacy/medicines')
      .set(await as('pharmacie.tournon'))
      .send(NEW_MEDICINE);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe('pending');
    const id = res.body.id as string;

    const row = (await pool.query('SELECT status, submitted_by FROM medicines WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ status: 'pending', submitted_by: TOURNON });
    const audit = (await pool.query("SELECT action FROM audit_log WHERE target = $1 AND action = 'submit_medicine'", [`medicine:${id}`]))
      .rowCount;
    expect(audit).toBe(1);

    // The pharmacy sees it in its stock with the pending status and in its proposals.
    const stock = await api()
      .get('/api/pharmacy/inventory')
      .set(await as('pharmacie.tournon'));
    expect(stock.body.items.find((i: { medicineId: string }) => i.medicineId === id)).toMatchObject({ status: 'pending', quantity: 12 });
    const mine = await api()
      .get('/api/pharmacy/medicines/proposals')
      .set(await as('pharmacie.tournon'));
    expect(mine.body.items[0]).toMatchObject({ id, status: 'pending' });

    // Patients never find it.
    const search = await api()
      .get('/api/medicines?q=Zorbexil')
      .set(await as('alice'));
    expect(search.body.items).toHaveLength(0);
    expect(
      (
        await api()
          .get(`/api/medicines/${id}`)
          .set(await as('alice'))
      ).status,
    ).toBe(404);
    const request = await api()
      .post('/api/patient/requests')
      .set(await as('alice'))
      .send({ items: [{ medicineId: id, quantity: 1 }] });
    expect(request.status).toBe(400);
  });

  it('detects duplicates: same CIP13, and look-alikes until the pharmacy confirms', async () => {
    const h = await as('pharmacie.valence');
    // Same CIP13 as a proposal of another pharmacy: refused without revealing it.
    const same = await api().post('/api/pharmacy/medicines').set(h).send(NEW_MEDICINE);
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('already_submitted');

    // An existing catalogue entry (Doliprane 1000 mg) with a new CIP13: possible duplicate, with the candidates.
    const dup = await api()
      .post('/api/pharmacy/medicines')
      .set(h)
      .send({ ...NEW_MEDICINE, cip13: '3400999000028', name: 'Doliprane 1000 mg', dosage: '1000 mg', stock: undefined });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('possible_duplicate');
    expect(dup.body.details.candidates[0]).toMatchObject({ id: medicineId(0) });

    // The catalogue's own CIP13 is a hard duplicate (no confirm possible).
    const cip = (await pool.query('SELECT cip13 FROM medicines WHERE id = $1', [medicineId(0)])).rows[0].cip13;
    const hard = await api()
      .post('/api/pharmacy/medicines')
      .set(h)
      .send({ ...NEW_MEDICINE, cip13: cip, confirmNew: true });
    expect(hard.status).toBe(409);
    expect(hard.body.code).toBe('duplicate_cip13');

    // The pre-check finds the same candidates without storing anything.
    const check = await api().post('/api/pharmacy/medicines/check').set(h).send({ name: 'Doliprane 1000 mg', dosage: '1000 mg' });
    expect(check.body.candidates.map((c: { id: string }) => c.id)).toContain(medicineId(0));

    // Confirming that it is different goes through (and is noted in the audit log).
    const ok = await api()
      .post('/api/pharmacy/medicines')
      .set(h)
      .send({ ...NEW_MEDICINE, cip13: '3400999000028', name: 'Doliprane 1000 mg', dosage: '1000 mg', confirmNew: true, stock: undefined });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const note = (
      await pool.query("SELECT reason FROM audit_log WHERE target = $1 AND action = 'submit_medicine'", [`medicine:${ok.body.id}`])
    ).rows[0];
    expect(note.reason).toMatch(/not a duplicate/);
  });

  it('only pharmacies can propose; patients and doctors cannot', async () => {
    for (const who of ['alice', 'dr.martin']) {
      const res = await api()
        .post('/api/pharmacy/medicines')
        .set(await as(who))
        .send(NEW_MEDICINE);
      expect(res.status, who).toBe(403);
    }
  });

  it('staff review list: moderators approve (patients can then find it) or reject with a reason; support only reads', async () => {
    const queue = await api()
      .get('/api/admin/medicine-reviews')
      .set(await as('support'));
    expect(queue.status).toBe(200);
    const first = queue.body.items.find((m: { name: string }) => m.name === 'Zorbexil Test');
    expect(first).toMatchObject({ status: 'pending', pharmacyName: expect.any(String) });
    expect(
      (
        await api()
          .get('/api/admin/stats')
          .set(await as('support'))
      ).body.pendingMedicines,
    ).toBeGreaterThanOrEqual(1);

    // support cannot decide
    expect(
      (
        await api()
          .post(`/api/admin/medicine-reviews/${first.id}/approve`)
          .set(await as('support'))
          .send({})
      ).status,
    ).toBe(403);
    // rejection needs a reason
    expect(
      (
        await api()
          .post(`/api/admin/medicine-reviews/${first.id}/reject`)
          .set(await as('moderator'))
          .send({})
      ).status,
    ).toBe(400);

    const approved = await api()
      .post(`/api/admin/medicine-reviews/${first.id}/approve`)
      .set(await as('moderator'))
      .send({});
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(
      (
        await api()
          .get('/api/medicines?q=Zorbexil')
          .set(await as('alice'))
      ).body.items,
    ).toHaveLength(1);
    expect(
      (await pool.query("SELECT 1 FROM audit_log WHERE action = 'approve_medicine' AND target = $1", [`medicine:${first.id}`])).rowCount,
    ).toBe(1);
    expect((await pool.query("SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'medicine_review'", [TOURNON])).rowCount).toBe(1);
    // decided once
    expect(
      (
        await api()
          .post(`/api/admin/medicine-reviews/${first.id}/approve`)
          .set(await as('moderator'))
          .send({})
      ).status,
    ).toBe(409);

    const second = queue.body.items.find((m: { name: string }) => m.name !== 'Zorbexil Test');
    const rejected = await api()
      .post(`/api/admin/medicine-reviews/${second.id}/reject`)
      .set(await as('moderator'))
      .send({ reason: 'Already in the catalogue under another name' });
    expect(rejected.status).toBe(200);
    const mine = await api()
      .get('/api/pharmacy/medicines/proposals')
      .set(await as('pharmacie.valence'));
    expect(mine.body.items[0]).toMatchObject({ status: 'rejected', reviewNote: 'Already in the catalogue under another name' });
    expect(
      (
        await api()
          .get(`/api/medicines/${second.id}`)
          .set(await as('alice'))
      ).status,
    ).toBe(404);
  });

  it('CSV import: updates stock, and unknown CIP13 codes with a full description become proposals; look-alikes are flagged', async () => {
    const h = await as('pharmacie.romans');
    const head = 'cip13;quantity;price_eur;name;active_substance;form;dosage;category;requires_prescription';
    const csv = [
      head,
      '3400999000035;5;3,20;Quivraxol Test;quivraxine;syrup;5 mg/ml;cold;0',
      '3400999000042;1;2,00;Doliprane 1000 mg;paracétamol;tablet;1000 mg;pain;0',
      '1234;1;1;x;x;tablet;1;pain;0',
    ].join('\n');
    const preview = await api().post('/api/pharmacy/inventory/csv').set(h).send({ csv, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body.rows[0].error).toBeNull();
    expect(preview.body.rows[1].error).toMatch(/looks like an existing medicine/);
    expect(preview.body.rows[2].error).toMatch(/13 digits/);
    // applying is refused while rows have errors
    expect((await api().post('/api/pharmacy/inventory/csv').set(h).send({ csv, dryRun: false })).status).toBe(400);

    const good = [head, '3400999000035;5;3,20;Quivraxol Test;quivraxine;syrup;5 mg/ml;cold;0'].join('\n');
    const applied = await api().post('/api/pharmacy/inventory/csv').set(h).send({ csv: good, dryRun: false });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.submitted).toBe(1);
    const m = (await pool.query("SELECT status, submitted_by FROM medicines WHERE cip13 = '3400999000035'")).rows[0];
    expect(m).toMatchObject({ status: 'pending', submitted_by: userId.pharmacy('romans') });
  });

  it('the migration only adds: existing medicines stay approved and a bad status is refused by the database', async () => {
    const n = (await pool.query("SELECT count(*)::int AS n FROM medicines WHERE status = 'approved' AND submitted_by IS NULL")).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(50);
    await expect(pool.query("UPDATE medicines SET status = 'whatever' WHERE id = $1", [medicineId(0)])).rejects.toThrow();
  });
});
