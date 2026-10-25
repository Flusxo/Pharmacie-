import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { notFound } from '../errors.js';
import { addRoutes } from '../openapi.js';
import {
  MEDICINE_COLUMNS,
  PHARMACY_PUBLIC_COLUMNS,
  nearbyForMedicine,
  nearbyPharmacies,
  searchMedicines,
  suggest,
} from '../services/search.js';
import { idParam, latitude, longitude, page } from '../validate.js';

export const publicRouter = Router();

const radius = z.coerce.number().min(1).max(100).default(30);
const location = z.object({ lat: latitude, lon: longitude, radiusKm: radius });

publicRouter.get('/medicines', async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().max(80).optional(),
      category: z.string().trim().max(40).optional(),
      page,
      lat: latitude.optional(),
      lon: longitude.optional(),
      radiusKm: radius,
    })
    .parse(req.query);
  res.json(await searchMedicines(q));
});

publicRouter.get('/medicines/suggest', async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(80).default('') }).parse(req.query);
  res.json({ items: await suggest(q) });
});

publicRouter.get('/medicines/categories', async (_req, res) => {
  const rows = await query(
    `SELECT category, count(*)::int AS count, bool_or(requires_prescription) AS "hasPrescription"
       FROM medicines WHERE deleted_at IS NULL AND status = 'approved' GROUP BY category ORDER BY count DESC, category`,
  );
  res.json({ items: rows });
});

publicRouter.get('/medicines/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const m = await one<{ activeSubstance: string; dosage: string }>(
    `SELECT ${MEDICINE_COLUMNS},
            (SELECT count(*) FROM pharmacy_inventory i JOIN eligible_pharmacies ep ON ep.user_id = i.pharmacy_id
              WHERE i.medicine_id = m.id AND i.quantity > 0)::int AS "availableAt"
       FROM medicines m WHERE m.id = $1 AND m.deleted_at IS NULL AND m.status = 'approved'`,
    [id],
  );
  if (!m) throw notFound('This medicine does not exist.');
  // Generics: same active substance and same dosage.
  const generics = await query(
    `SELECT ${MEDICINE_COLUMNS} FROM medicines m
      WHERE m.deleted_at IS NULL AND m.status = 'approved' AND m.id <> $1 AND f_norm(m.active_substance) = f_norm($2) AND f_norm(m.dosage) = f_norm($3)
      ORDER BY m.name`,
    [id, m.activeSubstance, m.dosage],
  );
  res.json({ medicine: m, generics });
});

publicRouter.get('/medicines/:id/pharmacies', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const loc = location.parse(req.query);
  const exists = await one("SELECT 1 FROM medicines WHERE id = $1 AND deleted_at IS NULL AND status = 'approved'", [id]);
  if (!exists) throw notFound('This medicine does not exist.');
  res.json({ items: await nearbyForMedicine(id, loc.lat, loc.lon, loc.radiusKm) });
});

publicRouter.get('/pharmacies/nearby', async (req, res) => {
  const loc = location.parse(req.query);
  res.json({ items: await nearbyPharmacies(loc.lat, loc.lon, loc.radiusKm) });
});

publicRouter.get('/pharmacies/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const p = await one(`SELECT ${PHARMACY_PUBLIC_COLUMNS} FROM eligible_pharmacies ep WHERE ep.user_id = $1`, [id]);
  if (!p) throw notFound('This pharmacy is not available.');
  const extra = await one('SELECT services, languages, accessibility, verified FROM pharmacies WHERE user_id = $1', [id]);
  res.json({ pharmacy: { ...p, ...extra } });
});

addRoutes([
  [
    'get',
    '/api/medicines',
    'Public',
    'Search medicines (q, category, page, lat, lon, radiusKm) — accent/typo tolerant, 20 per page, didYouMean',
  ],
  ['get', '/api/medicines/suggest', 'Public', 'Autocomplete suggestions'],
  ['get', '/api/medicines/categories', 'Public', 'Categories with counts'],
  ['get', '/api/medicines/:id', 'Public', 'Medicine details with generics (same substance and dosage)'],
  ['get', '/api/medicines/:id/pharmacies', 'Public', 'Nearby eligible pharmacies with stock for this medicine, sorted by distance'],
  ['get', '/api/pharmacies/nearby', 'Public', 'Eligible pharmacies near a point'],
  ['get', '/api/pharmacies/:id', 'Public', 'Public pharmacy information'],
]);
