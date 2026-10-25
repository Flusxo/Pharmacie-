import { one, type Db, pool } from '../db.js';
import { notFound } from '../errors.js';

/** Public view of the logged-in user. Never includes password hashes. */
export async function getProfile(userId: string, db: Db = pool): Promise<Record<string, unknown>> {
  const u = await one<{
    id: string;
    email: string;
    role: string;
    status: string;
    email_notifications: boolean;
    totp_enabled: boolean;
    language: 'fr' | 'en';
    created_at: Date;
    last_login_at: Date | null;
  }>(
    `SELECT id, email, role, status, email_notifications, totp_enabled, language, created_at, last_login_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
    db,
  );
  if (!u) throw notFound('Account not found.');
  const base = {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    emailNotifications: u.email_notifications,
    totpEnabled: u.totp_enabled,
    language: u.language,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
  if (u.role === 'patient') {
    const p = await one(
      `SELECT first_name AS "firstName", last_name AS "lastName", to_char(birth_date, 'YYYY-MM-DD') AS "birthDate", phone, address, latitude, longitude
         FROM patients WHERE user_id = $1`,
      [userId],
      db,
    );
    return { ...base, verified: true, displayName: p ? `${p.firstName as string}` : '', patient: p };
  }
  if (u.role === 'doctor') {
    const d = await one<{ firstName: string; lastName: string; verified: boolean }>(
      `SELECT first_name AS "firstName", last_name AS "lastName", rpps, speciality, verified, rejection_reason AS "rejectionReason" FROM doctors WHERE user_id = $1`,
      [userId],
      db,
    );
    return { ...base, verified: !!d?.verified, displayName: d ? `Dr ${d.firstName} ${d.lastName}` : '', doctor: d };
  }
  if (u.role === 'pharmacy') {
    const member = await one<{ pharmacyId: string; memberRole: string; displayName: string }>(
      'SELECT pharmacy_id AS "pharmacyId", member_role AS "memberRole", display_name AS "displayName" FROM pharmacy_members WHERE user_id = $1',
      [userId],
      db,
    );
    const p = await one<{ name: string; verified: boolean }>(
      `SELECT name, finess, address, city, phone, latitude, longitude, verified, paused, rejection_reason AS "rejectionReason",
              opening_hours AS "openingHours", on_duty AS "onDuty", services, languages, accessibility, paused_until AS "pausedUntil"
         FROM pharmacies WHERE user_id = $1`,
      [member?.pharmacyId ?? userId],
      db,
    );
    return { ...base, verified: !!p?.verified, displayName: p?.name ?? '', pharmacy: p, memberRole: member?.memberRole ?? 'owner', memberName: member?.displayName ?? null };
  }
  const s = await one<{ fullName: string; staffRole: string }>(
    `SELECT full_name AS "fullName", staff_role AS "staffRole" FROM staff WHERE user_id = $1`,
    [userId],
    db,
  );
  return { ...base, verified: true, displayName: s?.fullName ?? '', staff: s };
}
