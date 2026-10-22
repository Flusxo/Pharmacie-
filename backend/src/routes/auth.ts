import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { RULES, config, isTest } from '../config.js';
import { one, pool, tx, type Db } from '../db.js';
import { HttpError, badRequest, conflict } from '../errors.js';
import { requireAuth, signToken, type Role } from '../middleware/auth.js';
import { getProfile } from '../services/profile.js';
import { emailField, latitude, longitude, passwordField } from '../validate.js';
import { sendMail } from '../notify.js';
import { log, maskEmail } from '../logger.js';
import { decryptSecret, encryptSecret, newSecret, otpauthUrl, base32Encode, verifyTotp } from '../totp.js';

export const authRouter = Router();

const GENERIC = 'Invalid email or password.';
// Compared against when the email is unknown so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const limiterOpts = { standardHeaders: 'draft-7' as const, legacyHeaders: false, skip: () => isTest };
const loginLimiter = rateLimit({
  ...limiterOpts,
  windowMs: 15 * 60_000,
  limit: 60,
  message: { error: 'Too many login attempts from this network. Please wait a few minutes.' },
});
const registerLimiter = rateLimit({
  ...limiterOpts,
  windowMs: 60 * 60_000,
  limit: 30,
  message: { error: 'Too many sign-ups from this network. Please try again later.' },
});
const resetLimiter = rateLimit({
  ...limiterOpts,
  windowMs: 15 * 60_000,
  limit: 10,
  message: { error: 'Too many password reset requests. Please wait a few minutes.' },
});

async function createUser(email: string, password: string, role: Role, status: 'active' | 'pending', db: Db = pool) {
  const exists = await one('SELECT 1 FROM users WHERE email = $1', [email], db);
  if (exists) throw conflict('An account with this email already exists. Try logging in or resetting your password.');
  const hash = await bcrypt.hash(password, 10);
  const u = await one<{ id: string }>(
    'INSERT INTO users (email, password_hash, role, status) VALUES ($1,$2,$3,$4) RETURNING id',
    [email, hash, role, status],
    db,
  );
  return u!.id;
}

const name = z.string().trim().min(1, 'is required').max(80);

authRouter.post('/register/patient', registerLimiter, async (req, res) => {
  const body = z
    .object({
      email: emailField,
      password: passwordField,
      firstName: name,
      lastName: name,
      birthDate: z.iso.date().optional(),
      phone: z.string().trim().max(30).optional(),
      address: z.string().trim().max(200).optional(),
      latitude: latitude.optional(),
      longitude: longitude.optional(),
    })
    .parse(req.body);
  const id = await tx(async (c) => {
    const uid = await createUser(body.email, body.password, 'patient', 'active', c);
    await c.query(
      `INSERT INTO patients (user_id, first_name, last_name, birth_date, phone, address, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        uid,
        body.firstName,
        body.lastName,
        body.birthDate ?? null,
        body.phone ?? null,
        body.address ?? null,
        body.latitude ?? null,
        body.longitude ?? null,
      ],
    );
    return uid;
  });
  res.status(201).json({ token: signToken({ id, role: 'patient' }), user: await getProfile(id) });
});

authRouter.post('/register/doctor', registerLimiter, async (req, res) => {
  const body = z
    .object({
      email: emailField,
      password: passwordField,
      firstName: name,
      lastName: name,
      rpps: z.string().regex(/^\d{11}$/, 'must be the 11-digit RPPS number'),
      speciality: z.string().trim().min(2).max(80).default('Médecine générale'),
    })
    .parse(req.body);
  const id = await tx(async (c) => {
    const taken = await one('SELECT 1 FROM doctors WHERE rpps = $1', [body.rpps], c);
    if (taken) throw conflict('This RPPS number is already registered.');
    const uid = await createUser(body.email, body.password, 'doctor', 'pending', c);
    await c.query(`INSERT INTO doctors (user_id, first_name, last_name, rpps, speciality) VALUES ($1,$2,$3,$4,$5)`, [
      uid,
      body.firstName,
      body.lastName,
      body.rpps,
      body.speciality,
    ]);
    return uid;
  });
  res.status(201).json({ token: signToken({ id, role: 'doctor' }), user: await getProfile(id) });
});

authRouter.post('/register/pharmacy', registerLimiter, async (req, res) => {
  const body = z
    .object({
      email: emailField,
      password: passwordField,
      name: z.string().trim().min(3).max(120),
      finess: z.string().regex(/^\d{9}$/, 'must be the 9-digit FINESS number'),
      address: z.string().trim().min(5).max(200),
      city: z.string().trim().min(1).max(80),
      phone: z.string().trim().max(30).optional(),
      latitude,
      longitude,
    })
    .parse(req.body);
  const id = await tx(async (c) => {
    const taken = await one('SELECT 1 FROM pharmacies WHERE finess = $1', [body.finess], c);
    if (taken) throw conflict('This FINESS number is already registered.');
    const uid = await createUser(body.email, body.password, 'pharmacy', 'pending', c);
    await c.query(
      `INSERT INTO pharmacies (user_id, name, finess, address, city, phone, latitude, longitude, opening_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uid,
        body.name,
        body.finess,
        body.address,
        body.city,
        body.phone ?? null,
        body.latitude,
        body.longitude,
        JSON.stringify({
          mon: [['09:00', '19:00']],
          tue: [['09:00', '19:00']],
          wed: [['09:00', '19:00']],
          thu: [['09:00', '19:00']],
          fri: [['09:00', '19:00']],
          sat: [['09:00', '12:30']],
          sun: [],
        }),
      ],
    );
    return uid;
  });
  res.status(201).json({ token: signToken({ id, role: 'pharmacy' }), user: await getProfile(id) });
});

const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'must be the 6-digit code from your authenticator app');

authRouter.post('/login', loginLimiter, async (req, res) => {
  const body = z
    .object({
      email: emailField,
      password: z.string({ error: 'is required' }).min(1, 'is required').max(200),
      code: totpCode.optional(),
    })
    .parse(req.body);
  const u = await one<{
    id: string;
    password_hash: string;
    role: Role;
    status: string;
    failed_logins: number;
    locked_until: Date | null;
    totp_enabled: boolean;
    totp_secret_enc: string | null;
    totp_last_step: string | null;
  }>(
    `SELECT id, password_hash, role, status, failed_logins, locked_until, totp_enabled, totp_secret_enc, totp_last_step
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [body.email],
  );

  const now = new Date();
  if (!u) {
    await bcrypt.compare(body.password, DUMMY_HASH);
    throw new HttpError(401, GENERIC, 'invalid_credentials');
  }
  if (u.locked_until && u.locked_until > now) {
    await bcrypt.compare(body.password, DUMMY_HASH);
    log('warn', 'login_locked', { user: maskEmail(body.email) });
    throw new HttpError(401, GENERIC, 'invalid_credentials');
  }
  const ok = await bcrypt.compare(body.password, u.password_hash);
  // Two-step verification: the password was right; without a code, ask for one (not a failure).
  if (ok && u.totp_enabled && !body.code) {
    throw new HttpError(401, 'Enter the 6-digit code from your authenticator app.', 'totp_required');
  }
  let totpStep: number | null = null;
  if (ok && u.totp_enabled && u.totp_secret_enc) {
    totpStep = verifyTotp(decryptSecret(u.totp_secret_enc), body.code!);
    // A code already used (same or older step) is refused: no replay.
    if (totpStep !== null && u.totp_last_step !== null && totpStep <= Number(u.totp_last_step)) totpStep = null;
  }
  const totpFailed = ok && u.totp_enabled && totpStep === null;
  if (!ok || totpFailed) {
    const prior = u.locked_until && u.locked_until <= now ? 0 : u.failed_logins;
    const failures = prior + 1;
    const lock = failures >= RULES.LOCKOUT_FAILURES;
    await pool.query(
      `UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END WHERE id = $1`,
      [u.id, lock ? 0 : failures, lock, RULES.LOCKOUT_MINUTES],
    );
    log('warn', 'login_failed', { user: maskEmail(body.email), locked: lock, totp: totpFailed });
    if (totpFailed && !lock)
      throw new HttpError(401, 'The code is not correct or was already used. Wait for the next code.', 'totp_invalid');
    throw new HttpError(401, GENERIC, 'invalid_credentials');
  }
  if (u.status === 'suspended') throw new HttpError(403, 'This account is suspended. Contact support.', 'account_suspended');
  await pool.query(
    'UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now(), totp_last_step = COALESCE($2, totp_last_step) WHERE id = $1',
    [u.id, totpStep],
  );
  res.json({ token: signToken({ id: u.id, role: u.role }), user: await getProfile(u.id) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await getProfile(req.user!.id) });
});

authRouter.patch('/me/preferences', requireAuth, async (req, res) => {
  const body = z.object({ emailNotifications: z.boolean() }).parse(req.body);
  await pool.query('UPDATE users SET email_notifications = $2 WHERE id = $1', [req.user!.id, body.emailNotifications]);
  res.json({ user: await getProfile(req.user!.id) });
});

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

authRouter.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = z.object({ email: emailField }).parse(req.body);
  const u = await one<{ id: string }>('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(mins => $3))`, [
      sha256(token),
      u.id,
      RULES.RESET_TOKEN_MINUTES,
    ]);
    sendMail(
      email,
      'Reset your password',
      `Use this link within ${RULES.RESET_TOKEN_MINUTES} minutes: ${config.FRONTEND_URL}/reset-password?token=${token}`,
    );
  }
  // Same answer whether or not the email exists.
  res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
});

authRouter.post('/reset-password', resetLimiter, async (req, res) => {
  const body = z
    .object({ token: z.string().regex(/^[a-f0-9]{64}$/, 'is not a valid reset token'), password: passwordField })
    .parse(req.body);
  await tx(async (c) => {
    const r = await one<{ user_id: string }>(
      `UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [sha256(body.token)],
      c,
    );
    if (!r) throw badRequest('This reset link is invalid, expired or already used. Ask for a new one.');
    await c.query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', [
      r.user_id,
      await bcrypt.hash(body.password, 10),
    ]);
  });
  res.json({ message: 'Your password has been changed. You can now log in.' });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = z.object({ currentPassword: z.string().min(1), newPassword: passwordField }).parse(req.body);
  const u = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!u || !(await bcrypt.compare(body.currentPassword, u.password_hash))) {
    throw badRequest('Your current password is not correct.');
  }
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user!.id, await bcrypt.hash(body.newPassword, 10)]);
  res.json({ message: 'Password changed.' });
});

/* ---------- Two-step verification (TOTP) for professional accounts ---------- */

function requirePro(role: Role) {
  if (role === 'patient')
    throw new HttpError(403, 'Two-step verification is available for doctor, pharmacy and staff accounts.', 'forbidden');
}

/** Creates a new secret (not active until confirmed with a code). */
authRouter.post('/totp/setup', requireAuth, async (req, res) => {
  requirePro(req.user!.role);
  const u = await one<{ email: string; totp_enabled: boolean }>('SELECT email, totp_enabled FROM users WHERE id = $1', [req.user!.id]);
  if (u!.totp_enabled) throw conflict('Two-step verification is already on. Turn it off first to set up a new app.');
  const secret = newSecret();
  await pool.query('UPDATE users SET totp_secret_enc = $2, totp_last_step = NULL WHERE id = $1', [req.user!.id, encryptSecret(secret)]);
  res.json({ secret: base32Encode(secret), otpauthUrl: otpauthUrl(u!.email, secret) });
});

/** Turns it on once the app shows a valid code. */
authRouter.post('/totp/enable', requireAuth, async (req, res) => {
  requirePro(req.user!.role);
  const { code } = z.object({ code: totpCode }).parse(req.body);
  const u = await one<{ totp_enabled: boolean; totp_secret_enc: string | null }>(
    'SELECT totp_enabled, totp_secret_enc FROM users WHERE id = $1',
    [req.user!.id],
  );
  if (u!.totp_enabled) throw conflict('Two-step verification is already on.');
  if (!u!.totp_secret_enc) throw badRequest('Start the setup first.');
  const step = verifyTotp(decryptSecret(u!.totp_secret_enc), code);
  if (step === null) throw badRequest('The code is not correct. Check the time on your phone and try the next code.');
  await pool.query('UPDATE users SET totp_enabled = true, totp_last_step = $2 WHERE id = $1', [req.user!.id, step]);
  log('info', 'totp_enabled', { userId: req.user!.id });
  res.json({ user: await getProfile(req.user!.id) });
});

/** Turns it off; needs the password and a current code. */
authRouter.post('/totp/disable', requireAuth, async (req, res) => {
  requirePro(req.user!.role);
  const body = z.object({ password: z.string().min(1, 'is required'), code: totpCode }).parse(req.body);
  const u = await one<{ password_hash: string; totp_enabled: boolean; totp_secret_enc: string | null }>(
    'SELECT password_hash, totp_enabled, totp_secret_enc FROM users WHERE id = $1',
    [req.user!.id],
  );
  if (!u!.totp_enabled || !u!.totp_secret_enc) throw badRequest('Two-step verification is not on.');
  if (!(await bcrypt.compare(body.password, u!.password_hash))) throw badRequest('Your password is not correct.');
  if (verifyTotp(decryptSecret(u!.totp_secret_enc), body.code) === null) throw badRequest('The code is not correct.');
  await pool.query('UPDATE users SET totp_enabled = false, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = $1', [req.user!.id]);
  log('info', 'totp_disabled', { userId: req.user!.id });
  res.json({ user: await getProfile(req.user!.id) });
});
