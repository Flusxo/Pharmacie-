import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one, pool } from '../db.js';
import { HttpError, forbidden, unauthorized } from '../errors.js';

export type Role = 'patient' | 'doctor' | 'pharmacy' | 'staff';
export type StaffRole = 'admin' | 'support' | 'moderator';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  status: 'pending' | 'active' | 'suspended';
  staffRole: StaffRole | null;
  verified: boolean;
  /** Pharmacy accounts: 'owner' for the pharmacy's own account, else the team role. */
  memberRole?: 'owner' | 'pharmacist' | 'assistant';
  /** Team members: the pharmacy they work for (the pharmacy router then acts on it, see routes/pharmacy.ts). */
  pharmacyId?: string;
  /** Pharmacy router only: the person who acts (a team member), while id is the pharmacy. */
  actorId?: string;
  /** The login this request belongs to (absent for tokens issued before sessions existed). */
  sessionId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(user: { id: string; role: Role }, sessionId?: string): string {
  return jwt.sign({ sub: user.id, role: user.role, ...(sessionId ? { sid: sessionId } : {}) }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Reads the Bearer token if present and loads the user. Never fails on a missing token. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  let sub: string;
  let sid: string | undefined;
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET) as jwt.JwtPayload;
    sub = String(payload.sub);
    sid = typeof payload.sid === 'string' ? payload.sid : undefined;
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.', 'session_expired');
  }
  const row = await one<{
    id: string;
    email: string;
    role: Role;
    status: AuthUser['status'];
    staff_role: StaffRole | null;
    doctor_verified: boolean | null;
    pharmacy_verified: boolean | null;
    member_role: 'pharmacist' | 'assistant' | null;
    member_pharmacy: string | null;
    member_pharmacy_verified: boolean | null;
  }>(
    `SELECT u.id, u.email, u.role, u.status, s.staff_role, d.verified AS doctor_verified, p.verified AS pharmacy_verified,
          pm.member_role, pm.pharmacy_id AS member_pharmacy, mp.verified AS member_pharmacy_verified
       FROM users u
       LEFT JOIN staff s ON s.user_id = u.id
       LEFT JOIN doctors d ON d.user_id = u.id
       LEFT JOIN pharmacies p ON p.user_id = u.id
       LEFT JOIN pharmacy_members pm ON pm.user_id = u.id
       LEFT JOIN pharmacies mp ON mp.user_id = pm.pharmacy_id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [sub],
  );
  if (!row) throw new HttpError(401, 'Your session has expired. Please log in again.', 'session_expired');
  if (sid) {
    // A login that was signed out (or removed) is over, whatever the token's own expiry says.
    const s = await one<{ id: string }>('SELECT id FROM user_sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [sid, sub]);
    if (!s) throw new HttpError(401, 'Your session has expired. Please log in again.', 'session_expired');
    // Seen: refreshed at most once a minute.
    void pool
      .query("UPDATE user_sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'", [sid])
      .catch(() => {});
  }
  if (row.status === 'suspended') throw new HttpError(401, 'This account is suspended. Contact support.', 'account_suspended');
  req.user = {
    sessionId: sid,
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    staffRole: row.staff_role,
    verified:
      row.role === 'doctor'
        ? !!row.doctor_verified
        : row.role === 'pharmacy'
          ? !!(row.member_pharmacy ? row.member_pharmacy_verified : row.pharmacy_verified)
          : true,
    ...(row.role === 'pharmacy' ? { memberRole: row.member_role ?? ('owner' as const), pharmacyId: row.member_pharmacy ?? undefined } : {}),
  };
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  next();
}

/** Role gate. Doctors and pharmacies must also be verified and active. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    if ((req.user.role === 'doctor' || req.user.role === 'pharmacy') && (!req.user.verified || req.user.status !== 'active')) {
      throw new HttpError(
        403,
        'Waiting for staff approval. You can use this feature once your account is verified.',
        'pending_verification',
      );
    }
    next();
  };
}

export function requireStaff(...staffRoles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (req.user.role !== 'staff' || !req.user.staffRole) throw forbidden();
    if (staffRoles.length && !staffRoles.includes(req.user.staffRole)) {
      throw forbidden(`Your staff role (${req.user.staffRole}) cannot do this.`);
    }
    next();
  };
}
