import { beforeAll, describe, expect, it } from 'vitest';
import { api, freshDb } from './helpers.js';
import { pool } from '../src/db.js';

beforeAll(freshDb);

const TOURNON = { lat: 45.0655, lon: 4.83 };
type Item = { id: string; name: string; activeSubstance: string; category: string; availableAt: number };
const search = async (q: string, extra = '') =>
  (await api().get(`/api/medicines?q=${encodeURIComponent(q)}${extra}`)).body as {
    items: Item[];
    total: number;
    pages: number;
    didYouMean: string | null;
  };

describe('medicine search', () => {
  it('"para" and "PARA" both find paracetamol, ranked first', async () => {
    for (const q of ['para', 'PARA']) {
      const r = await search(q);
      expect(r.items.length).toBeGreaterThan(0);
      expect(r.items[0].name).toBe('Paracétamol Biogaran 1000 mg');
      // Prefix matches (paracetamol) come before substring matches such as "paraffine".
      expect(r.items.slice(0, 4).every((i) => i.activeSubstance.includes('paracétamol'))).toBe(true);
      expect(r.items.map((i) => i.name)).toContain('Doliprane 1000 mg');
    }
  });

  it('is accent-insensitive', async () => {
    const plain = await search('cetirizine');
    const accented = await search('cétirizine');
    expect(plain.items.map((i) => i.name)).toEqual(accented.items.map((i) => i.name));
    expect(plain.items.map((i) => i.name)).toEqual(expect.arrayContaining(['Cétirizine Sandoz 10 mg', 'Zyrtec 10 mg']));
  });

  it('tolerates typos: "dolliprane" finds Doliprane first', async () => {
    const r = await search('dolliprane');
    expect(r.items[0].name).toMatch(/^Doliprane/);
  });

  it('finds a medicine by its 13-digit CIP code (what a barcode scan sends)', async () => {
    const byName = await search('Doliprane');
    const cip = byName.items[0].cip13 as string;
    const r = await search(cip);
    expect(r.items[0].cip13).toBe(cip);
    expect(r.items[0].name).toMatch(/^Doliprane/);
  });

  it('ranks exact/prefix name matches before substring matches', async () => {
    const r = await search('ventoline');
    expect(r.items[0].name).toMatch(/^Ventoline/);
  });

  it('finds by category words in French', async () => {
    const r = await search('douleur');
    expect(r.items.length).toBeGreaterThan(3);
    expect(r.items.every((i) => i.category === 'pain')).toBe(true);
  });

  it('suggests a "did you mean" when nothing matches', async () => {
    const r = await search('zirtecc');
    expect(r.items).toHaveLength(0);
    expect(r.didYouMean).toBe('Zyrtec 10 mg');
    const none = await search('zzzzqqqq');
    expect(none.items).toHaveLength(0);
    expect(none.total).toBe(0);
  });

  it('paginates 20 per page', async () => {
    const p1 = await search('', '&page=1');
    const p3 = await search('', '&page=3');
    expect(p1.total).toBe(50);
    expect(p1.pages).toBe(3);
    expect(p1.items).toHaveLength(20);
    expect(p3.items).toHaveLength(10);
  });

  it('counts availability near a location', async () => {
    const r = await search('Doliprane 1000', `&lat=${TOURNON.lat}&lon=${TOURNON.lon}&radiusKm=30`);
    const d = r.items.find((i) => i.name === 'Doliprane 1000 mg')!;
    // Tournon, Valence and Romans are within 30 km; Étoile is too but has 0; the pending demo pharmacy never counts.
    expect(d.availableAt).toBe(3);
  });

  it('rejects an invalid page with a clear 400', async () => {
    const res = await api().get('/api/medicines?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/page/);
  });

  it('autocompletes', async () => {
    const res = await api().get('/api/medicines/suggest?q=dafal');
    expect(res.body.items[0].name).toBe('Dafalgan 500 mg');
  });
});

describe('medicine details and categories', () => {
  it('returns generics with the same substance and dosage', async () => {
    const r = await search('Doliprane 1000');
    const id = r.items.find((i) => i.name === 'Doliprane 1000 mg')!.id;
    const res = await api().get(`/api/medicines/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.medicine.name).toBe('Doliprane 1000 mg');
    const names = res.body.generics.map((g: { name: string }) => g.name);
    expect(names).toContain('Paracétamol Biogaran 1000 mg');
    expect(names).not.toContain('Dafalgan 500 mg');
  });

  it('404s for an unknown medicine and 400s for a malformed id', async () => {
    expect((await api().get('/api/medicines/00000000-0000-4000-a000-000000000000')).status).toBe(404);
    expect((await api().get('/api/medicines/not-a-uuid')).status).toBe(400);
  });

  it('lists categories with counts that add up', async () => {
    const res = await api().get('/api/medicines/categories');
    const total = res.body.items.reduce((s: number, c: { count: number }) => s + c.count, 0);
    expect(total).toBe(50);
  });
});

describe('nearby pharmacies', () => {
  let dolipraneId = '';
  beforeAll(async () => {
    dolipraneId = (await search('Doliprane 1000')).items.find((i) => i.name === 'Doliprane 1000 mg')!.id;
  });
  const nearby = async (q = `lat=${TOURNON.lat}&lon=${TOURNON.lon}&radiusKm=30`) =>
    (await api().get(`/api/medicines/${dolipraneId}/pharmacies?${q}`)).body.items as {
      name: string;
      distanceKm: number;
      inStock: boolean;
      quantity: number;
      priceEur: number | null;
    }[];

  it('sorts by distance with distance, quantity, price and in-stock flag', async () => {
    const items = await nearby();
    expect(items[0].name).toBe('Pharmacie du Rhône');
    for (let i = 1; i < items.length; i++) expect(items[i].distanceKm).toBeGreaterThanOrEqual(items[i - 1].distanceKm);
    expect(items[0]).toMatchObject({ inStock: true });
    expect(items[0].quantity).toBeGreaterThan(0);
    expect(items[0].priceEur).toBeGreaterThan(0);
    const etoile = items.find((p) => p.name === 'Pharmacie de l’Étoile');
    expect(etoile).toMatchObject({ inStock: false, quantity: 0 });
  });

  it('never proposes the pending (unverified) pharmacy, even when it is the closest', async () => {
    const items = await nearby();
    expect(items.map((p) => p.name)).not.toContain('Pharmacie Démo');
  });

  it('respects the radius', async () => {
    const items = await nearby(`lat=${TOURNON.lat}&lon=${TOURNON.lon}&radiusKm=5`);
    expect(items.map((p) => p.name)).toEqual(['Pharmacie du Rhône']);
  });

  it('hides a paused pharmacy ("mark all out of stock")', async () => {
    await pool.query(`UPDATE pharmacies SET paused = true WHERE name = 'Pharmacie Victor Hugo'`);
    expect((await nearby()).map((p) => p.name)).not.toContain('Pharmacie Victor Hugo');
    await pool.query(`UPDATE pharmacies SET paused = false WHERE name = 'Pharmacie Victor Hugo'`);
  });

  it('requires valid coordinates', async () => {
    const res = await api().get(`/api/medicines/${dolipraneId}/pharmacies?lat=200&lon=4`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lat/);
  });
});
