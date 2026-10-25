/** Deterministic seed: same ids, same data on every run (timestamps are relative to "now"). */
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { DOCTORS, MEDICINES, MEDICINES_EN, PATIENTS, PHARMACIES, STAFF, openingHours } from './data.js';

export const DEMO_PASSWORD = 'Password123!';
// Fixed salt keeps the seed deterministic. Demo accounts only.
const DEMO_HASH = bcrypt.hashSync(DEMO_PASSWORD, '$2a$10$PharmaLinkDemoSaltV1ab');

/** Deterministic UUID from a key. */
export function sid(key: string): string {
  const h = crypto.createHash('md5').update(`pharmalink:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fake demo details for the pharmacy profile pages.
const DEMO_SERVICES = [
  ['vaccination', 'blood_pressure'],
  ['orthopedics', 'homeopathy'],
  ['baby_corner', 'night_service'],
  ['vaccination', 'orthopedics'],
];
const DEMO_LANGUAGES = [['fr', 'en'], ['fr'], ['fr', 'es', 'ar'], ['fr', 'en', 'it']];
const DEMO_ACCESS = [['step_free', 'wide_door'], ['step_free'], ['hearing_loop', 'parking'], ['step_free', 'parking']];

export const email = (key: string) => `${key}@pharmacie.test`;

export const userId = {
  patient: (k: string) => sid(`user:${k}`),
  doctor: (k: string) => sid(`user:${k}`),
  pharmacy: (k: string) => sid(`user:pharmacie.${k}`),
  staff: (k: string) => sid(`user:${k}`),
};
export const medicineId = (i: number) => sid(`medicine:${i}`);

interface OrderSeed {
  key: string;
  patient: string;
  pharmacy: string;
  status: string;
  items: [number, number][];
  minutesAgo: number;
  doctor?: boolean;
}

export async function seed(c: pg.ClientBase): Promise<void> {
  const rand = mulberry32(42);
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  const addUser = (id: string, mail: string, role: string, status: string, createdMinutesAgo = 60 * 24 * 30) =>
    c.query(`INSERT INTO users (id, email, password_hash, role, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [
      id,
      mail,
      DEMO_HASH,
      role,
      status,
      ago(createdMinutesAgo),
    ]);

  for (const s of STAFF) {
    await addUser(userId.staff(s.key), email(s.key), 'staff', 'active');
    await c.query(`INSERT INTO staff (user_id, full_name, staff_role) VALUES ($1,$2,$3)`, [userId.staff(s.key), s.name, s.role]);
  }
  for (const d of DOCTORS) {
    await addUser(userId.doctor(d.key), email(d.key), 'doctor', d.verified ? 'active' : 'pending', d.verified ? 60 * 24 * 60 : 60 * 24);
    await c.query(`INSERT INTO doctors (user_id, first_name, last_name, rpps, speciality, verified) VALUES ($1,$2,$3,$4,$5,$6)`, [
      userId.doctor(d.key),
      d.first,
      d.last,
      d.rpps,
      d.speciality,
      d.verified,
    ]);
  }
  for (const p of PATIENTS) {
    await addUser(userId.patient(p.key), email(p.key), 'patient', 'active');
    await c.query(
      `INSERT INTO patients (user_id, first_name, last_name, birth_date, phone, address, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId.patient(p.key), p.first, p.last, p.birth, p.phone, p.address, p.lat, p.lon],
    );
  }
  for (const ph of PHARMACIES) {
    const id = userId.pharmacy(ph.key);
    await addUser(id, email(`pharmacie.${ph.key}`), 'pharmacy', ph.verified ? 'active' : 'pending', ph.verified ? 60 * 24 * 90 : 60 * 12);
    await c.query(
      `INSERT INTO pharmacies (user_id, name, finess, address, city, phone, latitude, longitude, verified, opening_hours, on_duty, services, languages, accessibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        ph.name,
        ph.finess,
        ph.address,
        ph.city,
        ph.phone,
        ph.lat,
        ph.lon,
        ph.verified,
        JSON.stringify(openingHours(ph.late)),
        JSON.stringify(ph.onDuty),
        JSON.stringify(DEMO_SERVICES[PHARMACIES.indexOf(ph) % DEMO_SERVICES.length]),
        JSON.stringify(DEMO_LANGUAGES[PHARMACIES.indexOf(ph) % DEMO_LANGUAGES.length]),
        JSON.stringify(DEMO_ACCESS[PHARMACIES.indexOf(ph) % DEMO_ACCESS.length]),
      ],
    );
  }

  for (const [i, m] of MEDICINES.entries()) {
    const cip = `34009${String(3000000 + i * 1373).padStart(8, '0')}`;
    await c.query(
      `INSERT INTO medicines (id, cip13, name, active_substance, form, dosage, category, requires_prescription, description, age_note,
                              description_en, age_note_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        medicineId(i),
        cip,
        m.name,
        m.substance,
        m.form,
        m.dosage,
        m.category,
        m.rx,
        m.description,
        m.age,
        MEDICINES_EN[i].description,
        MEDICINES_EN[i].age,
      ],
    );
  }

  // Inventory: Tournon stocks the first 12 generously; everyone else is varied (some zero, some low).
  for (const ph of PHARMACIES) {
    for (const [i, m] of MEDICINES.entries()) {
      let qty: number | null;
      if (ph.key === 'tournon' && i < 12) qty = 20 + Math.floor(rand() * 26);
      else if (i === 0) qty = ph.key === 'etoile' ? 0 : 8 + Math.floor(rand() * 30);
      else {
        const r = rand();
        qty = r < 0.25 ? null : r < 0.4 ? 0 : r < 0.55 ? 1 + Math.floor(rand() * 4) : 6 + Math.floor(rand() * 50);
      }
      if (qty === null) continue;
      const price = Math.round(m.price * (0.92 + rand() * 0.18) * 100) / 100;
      await c.query(
        `INSERT INTO pharmacy_inventory (pharmacy_id, medicine_id, quantity, price_eur, low_stock_threshold) VALUES ($1,$2,$3,$4,5)`,
        [userId.pharmacy(ph.key), medicineId(i), qty, price],
      );
    }
  }

  // Doctor links: Alice & Bruno confirmed with Dr Martin, Camille pending, David not linked.
  const martin = userId.doctor('dr.martin');
  await c.query(
    `INSERT INTO doctor_patients (doctor_id, patient_id, confirmed, created_at) VALUES ($1,$2,true,$3),($1,$4,true,$3),($1,$5,false,$6)`,
    [martin, userId.patient('alice'), ago(60 * 24 * 20), userId.patient('bruno'), userId.patient('camille'), ago(60 * 5)],
  );
  await c.query(
    `INSERT INTO notifications (user_id, kind, body, link, created_at) VALUES ($1,'doctor_link','Dr Claire Martin would like to link to your account.','/patient/doctors',$2)`,
    [userId.patient('camille'), ago(60 * 5)],
  );
  await c.query(`INSERT INTO doctor_templates (id, doctor_id, name, items, instructions) VALUES ($1,$2,$3,$4,$5)`, [
    sid('template:angine'),
    martin,
    'Angine (adulte)',
    JSON.stringify([
      { medicineId: medicineId(11), quantity: 1 },
      { medicineId: medicineId(0), quantity: 1 },
    ]),
    'Amoxicilline 1 g matin et soir pendant 6 jours. Paracétamol si fièvre.',
  ]);

  // Orders: Alice's order at "preparing" + 10 more in varied statuses.
  const FLOW = ['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
  const orders: OrderSeed[] = [
    {
      key: 'o1',
      patient: 'alice',
      pharmacy: 'tournon',
      status: 'preparing',
      items: [
        [0, 2],
        [8, 1],
      ],
      minutesAgo: 25,
    },
    { key: 'o2', patient: 'bruno', pharmacy: 'valence', status: 'delivered', items: [[4, 1]], minutesAgo: 60 * 72 },
    { key: 'o3', patient: 'camille', pharmacy: 'romans', status: 'ready', items: [[5, 1]], minutesAgo: 90 },
    {
      key: 'o4',
      patient: 'david',
      pharmacy: 'lyon1',
      status: 'out_for_delivery',
      items: [
        [2, 1],
        [6, 1],
      ],
      minutesAgo: 120,
    },
    { key: 'o5', patient: 'emma', pharmacy: 'vienne', status: 'accepted', items: [[10, 1]], minutesAgo: 10 },
    { key: 'o6', patient: 'alice', pharmacy: 'tournon', status: 'delivered', items: [[7, 1]], minutesAgo: 60 * 24 * 10 },
    { key: 'o7', patient: 'bruno', pharmacy: 'etoile', status: 'cancelled', items: [[3, 1]], minutesAgo: 60 * 24 * 5 },
    { key: 'o8', patient: 'david', pharmacy: 'lyon3', status: 'delivered', items: [[18, 2]], minutesAgo: 60 * 24 * 2 },
    { key: 'o9', patient: 'emma', pharmacy: 'vienne', status: 'delivered', items: [[20, 1]], minutesAgo: 60 * 24 * 7 },
    { key: 'o10', patient: 'camille', pharmacy: 'romans', status: 'preparing', items: [[27, 1]], minutesAgo: 40 },
    { key: 'o11', patient: 'alice', pharmacy: 'valence', status: 'delivered', items: [[11, 1]], minutesAgo: 60 * 24 * 15, doctor: true },
  ];
  for (const o of orders) {
    const reqId = sid(`request:${o.key}`);
    const orderId = sid(`order:${o.key}`);
    const created = ago(o.minutesAgo);
    const acceptedAt = new Date(created.getTime() + 4 * 60_000);
    await c.query(
      `INSERT INTO requests (id, patient_id, doctor_id, source, status, instructions, idempotency_key, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'accepted',$5,$6,$7,$7)`,
      [
        reqId,
        userId.patient(o.patient),
        o.doctor ? martin : null,
        o.doctor ? 'doctor' : 'patient',
        o.doctor ? 'Un comprimé matin et soir pendant 6 jours.' : null,
        `seed-${o.key}`,
        created,
      ],
    );
    for (const [idx, [mi, qty]] of o.items.entries()) {
      await c.query(`INSERT INTO request_items (id, request_id, medicine_id, quantity) VALUES ($1,$2,$3,$4)`, [
        sid(`item:${o.key}:${idx}`),
        reqId,
        medicineId(mi),
        qty,
      ]);
    }
    await c.query(
      `INSERT INTO request_pharmacies (request_id, pharmacy_id, chosen_by_patient, response, sent_at, responded_at) VALUES ($1,$2,true,'accepted',$3,$4)`,
      [reqId, userId.pharmacy(o.pharmacy), created, acceptedAt],
    );
    const steps = o.status === 'cancelled' ? ['accepted', 'cancelled'] : FLOW.slice(0, FLOW.indexOf(o.status) + 1);
    const last = new Date(acceptedAt.getTime() + (steps.length - 1) * 6 * 60_000);
    await c.query(
      `INSERT INTO orders (id, request_id, pharmacy_id, patient_id, status, share_token, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        orderId,
        reqId,
        userId.pharmacy(o.pharmacy),
        userId.patient(o.patient),
        o.status,
        sid(`share:${o.key}`).replace(/-/g, ''),
        acceptedAt,
        last,
      ],
    );
    for (const [si, st] of steps.entries()) {
      await c.query(`INSERT INTO order_status_history (order_id, status, changed_at, changed_by) VALUES ($1,$2,$3,$4)`, [
        orderId,
        st,
        new Date(acceptedAt.getTime() + si * 6 * 60_000),
        userId.pharmacy(o.pharmacy),
      ]);
    }
  }

  // One incoming request waiting at Tournon (Bruno, non-prescription).
  const incoming = sid('request:incoming1');
  await c.query(
    `INSERT INTO requests (id, patient_id, source, status, idempotency_key, created_at, updated_at) VALUES ($1,$2,'patient','sent_to_pharmacy','seed-incoming1',$3,$3)`,
    [incoming, userId.patient('bruno'), ago(3)],
  );
  await c.query(`INSERT INTO request_items (id, request_id, medicine_id, quantity) VALUES ($1,$2,$3,1)`, [
    sid('item:incoming1:0'),
    incoming,
    medicineId(5),
  ]);
  await c.query(`INSERT INTO request_pharmacies (request_id, pharmacy_id, sent_at) VALUES ($1,$2,$3)`, [
    incoming,
    userId.pharmacy('tournon'),
    ago(3),
  ]);

  await c.query(
    `INSERT INTO notifications (user_id, kind, body, link, created_at) VALUES ($1,'order_status','Update on your request: your order is being prepared.',$2,$3)`,
    [userId.patient('alice'), `/orders/${sid('order:o1')}`, ago(20)],
  );
  // Demo messages from the public Contact page (fictional people, example.com addresses).
  await c.query(
    `INSERT INTO contact_messages (name, email, topic, subject, message, language, created_at) VALUES
       ($1,$2,'pharmacy',$3,$4,'fr',$5), ($6,$7,'press',$8,$9,'en',$10)`,
    [
      'Léa Bonnet',
      'lea.bonnet@example.com',
      'Rejoindre counter.',
      'Bonjour, notre officine à Montélimar aimerait tester la plateforme. Comment se passe la vérification ?',
      ago(60 * 5),
      'Sam Taylor',
      'sam.taylor@example.com',
      'Interview request',
      'Hello, I am writing about digital health in France. Could we talk about the prototype?',
      ago(60 * 30),
    ],
  );
  await c.query(`INSERT INTO reports (reporter_user_id, subject, message, created_at) VALUES ($1,$2,$3,$4)`, [
    userId.patient('emma'),
    'Horaires incorrects',
    'Les horaires du samedi affichés pour la Pharmacie du Forum semblent faux.',
    ago(60 * 26),
  ]);
  await c.query(
    `INSERT INTO audit_log (actor_user_id, action, target, reason, created_at) VALUES ($1,'verify_pharmacy',$2,'Seed: initial verification',$3)`,
    [userId.staff('admin'), `pharmacy:${userId.pharmacy('tournon')}`, ago(60 * 24 * 89)],
  );
}
