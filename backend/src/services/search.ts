import { RULES } from '../config.js';
import { one, query } from '../db.js';

/** Category keys with French/English words a patient may type. */
export const CATEGORY_WORDS: Record<string, string[]> = {
  pain: ['douleur', 'douleurs', 'fievre', 'antalgique', 'pain', 'fever', 'painkiller'],
  allergy: ['allergie', 'allergies', 'allergy', 'antihistaminique'],
  cold: ['rhume', 'gorge', 'toux', 'nez', 'cold', 'throat', 'cough'],
  digestion: ['digestion', 'diarrhee', 'estomac', 'ventre', 'stomach', 'diarrhea'],
  vitamins: ['vitamine', 'vitamines', 'vitamin', 'vitamins', 'magnesium'],
  skin: ['peau', 'creme', 'brulure', 'skin', 'cream', 'burn'],
  antibiotics: ['antibiotique', 'antibiotiques', 'antibiotic', 'antibiotics'],
  diabetes: ['diabete', 'insuline', 'diabetes', 'insulin'],
  cardio: ['tension', 'coeur', 'cardio', 'blood pressure', 'heart', 'hypertension'],
  respiratory: ['asthme', 'respiratoire', 'inhalateur', 'asthma', 'inhaler', 'respiratory'],
  hormones: ['thyroide', 'hormone', 'hormones', 'thyroid'],
};

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const MEDICINE_COLUMNS = `m.id, m.cip13, m.name, m.active_substance AS "activeSubstance", m.form, m.dosage, m.category,
  m.requires_prescription AS "requiresPrescription", m.image_url AS "imageUrl", m.description, m.age_note AS "ageNote"`;

export interface SearchParams {
  q?: string;
  category?: string;
  page: number;
  lat?: number;
  lon?: number;
  radiusKm: number;
}

/**
 * Ranked search: exact (0) > prefix (1) > substring/category (2) > trigram similarity >= 0.3 (3).
 * Accent- and case-insensitive through f_norm().
 */
export async function searchMedicines(p: SearchParams) {
  const q = normalize(p.q ?? '');
  const cats = q
    ? Object.entries(CATEGORY_WORDS)
        .filter(([key, words]) => key === q || words.some((w) => w === q || (q.length >= 4 && w.startsWith(q))))
        .map(([key]) => key)
    : [];
  const offset = (p.page - 1) * RULES.PAGE_SIZE;
  const hasLoc = p.lat !== undefined && p.lon !== undefined;

  const params: unknown[] = [
    q,
    escapeLike(q),
    cats,
    p.category ?? null,
    RULES.PAGE_SIZE,
    offset,
    hasLoc ? p.lat : null,
    hasLoc ? p.lon : null,
    p.radiusKm,
  ];
  const rows = await query<Record<string, unknown> & { total: number }>(
    `WITH scored AS (
       SELECT m.*, f_norm(m.name) AS n, f_norm(m.active_substance) AS s,
         CASE
           WHEN $1 = '' THEN 1
           WHEN f_norm(m.name) = $1 OR f_norm(m.active_substance) = $1 THEN 0
           WHEN f_norm(m.name) LIKE $2 || '%' ESCAPE '\\' OR f_norm(m.active_substance) LIKE $2 || '%' ESCAPE '\\'
             OR f_norm(m.name) LIKE '% ' || $2 || '%' ESCAPE '\\' THEN 1
           WHEN f_norm(m.name) LIKE '%' || $2 || '%' ESCAPE '\\' OR f_norm(m.active_substance) LIKE '%' || $2 || '%' ESCAPE '\\'
             OR m.category = ANY($3::text[]) THEN 2
           ELSE 3
         END AS rank,
         CASE WHEN $1 = '' THEN 0 ELSE greatest(
           word_similarity($1, f_norm(m.name)), word_similarity($1, f_norm(m.active_substance)), similarity($1, f_norm(m.name))
         ) END AS sim
       FROM medicines m
       WHERE m.deleted_at IS NULL AND ($4::text IS NULL OR m.category = $4)
     )
     SELECT ${MEDICINE_COLUMNS}, m.rank, round(m.sim::numeric, 3)::float AS score,
       (SELECT count(*) FROM pharmacy_inventory i JOIN eligible_pharmacies ep ON ep.user_id = i.pharmacy_id
         WHERE i.medicine_id = m.id AND i.quantity > 0
           AND ($7::float8 IS NULL OR haversine_km($7, $8, ep.latitude, ep.longitude) <= $9))::int AS "availableAt",
       count(*) OVER ()::int AS total
     FROM scored m
     WHERE m.rank < 3 OR m.sim >= 0.3
     ORDER BY m.rank, m.sim DESC, m.name
     LIMIT $5 OFFSET $6`,
    params,
  );
  const total = rows[0]?.total ?? 0;
  const items = rows.map(({ total: _t, rank: _r, ...rest }) => rest);

  let didYouMean: string | null = null;
  if (q && items.length === 0) {
    const s = await one<{ name: string }>(
      `SELECT name FROM medicines WHERE deleted_at IS NULL AND similarity(f_norm(name), $1) > 0.1
        ORDER BY similarity(f_norm(name), $1) DESC LIMIT 1`,
      [q],
    );
    didYouMean = s?.name ?? null;
  }
  return { items, total, page: p.page, pageSize: RULES.PAGE_SIZE, pages: Math.ceil(total / RULES.PAGE_SIZE), didYouMean };
}

/** Autocomplete: up to 8 names. */
export async function suggest(qRaw: string) {
  const q = normalize(qRaw);
  if (q.length < 2) return [];
  return query(
    `SELECT id, name, dosage, form, category, requires_prescription AS "requiresPrescription"
       FROM medicines
      WHERE deleted_at IS NULL AND (f_norm(name) LIKE '%' || $2 || '%' ESCAPE '\\' OR word_similarity($1, f_norm(name)) >= 0.35
            OR f_norm(active_substance) LIKE $2 || '%' ESCAPE '\\')
      ORDER BY (f_norm(name) LIKE $2 || '%' ESCAPE '\\') DESC, word_similarity($1, f_norm(name)) DESC, name
      LIMIT 8`,
    [q, escapeLike(q)],
  );
}

export const PHARMACY_PUBLIC_COLUMNS = `ep.user_id AS id, ep.name, ep.address, ep.city, ep.phone, ep.latitude, ep.longitude,
  ep.opening_hours AS "openingHours", ep.on_duty AS "onDuty"`;

/** Eligible pharmacies near a point, with stock for one medicine. Sorted by distance. */
export async function nearbyForMedicine(medicineId: string, lat: number, lon: number, radiusKm: number) {
  return query(
    `SELECT ${PHARMACY_PUBLIC_COLUMNS},
            round(haversine_km($2, $3, ep.latitude, ep.longitude)::numeric, 2)::float AS "distanceKm",
            coalesce(i.quantity, 0) AS quantity, i.price_eur AS "priceEur", coalesce(i.quantity, 0) > 0 AS "inStock",
            (i.quantity IS NOT NULL AND i.quantity > 0 AND i.quantity <= i.low_stock_threshold) AS "lowStock"
       FROM eligible_pharmacies ep
       LEFT JOIN pharmacy_inventory i ON i.pharmacy_id = ep.user_id AND i.medicine_id = $1
      WHERE haversine_km($2, $3, ep.latitude, ep.longitude) <= $4
      ORDER BY haversine_km($2, $3, ep.latitude, ep.longitude)`,
    [medicineId, lat, lon, radiusKm],
  );
}

/** All eligible pharmacies near a point (for the "Around you" map). */
export async function nearbyPharmacies(lat: number, lon: number, radiusKm: number) {
  return query(
    `SELECT ${PHARMACY_PUBLIC_COLUMNS},
            round(haversine_km($1, $2, ep.latitude, ep.longitude)::numeric, 2)::float AS "distanceKm"
       FROM eligible_pharmacies ep
      WHERE haversine_km($1, $2, ep.latitude, ep.longitude) <= $3
      ORDER BY "distanceKm"`,
    [lat, lon, radiusKm],
  );
}
