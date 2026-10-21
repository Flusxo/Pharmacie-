import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { homeFor, useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

type Tab = 'patient' | 'doctor' | 'pharmacy' | 'staff';

// Shown only in development builds (import.meta.env.DEV). Seed accounts, password Password123!.
const DEMO_PASSWORD = import.meta.env.DEV ? 'Password123!' : '';
const DEMO: Record<Tab, { email: string; note: string }[]> | null = !import.meta.env.DEV
  ? null
  : {
      patient: [
        { email: 'alice@pharmacie.test', note: 'Alice — Tournon' },
        { email: 'bruno@pharmacie.test', note: 'Bruno — Valence' },
        { email: 'camille@pharmacie.test', note: 'Camille — Romans' },
        { email: 'david@pharmacie.test', note: 'David — Lyon' },
        { email: 'emma@pharmacie.test', note: 'Emma — Vienne' },
      ],
      doctor: [
        { email: 'dr.martin@pharmacie.test', note: 'Dr Martin (verified)' },
        { email: 'dr.bernard@pharmacie.test', note: 'Dr Bernard (pending)' },
        { email: 'dr.petit@pharmacie.test', note: 'Dr Petit (pending)' },
      ],
      pharmacy: [
        { email: 'pharmacie.tournon@pharmacie.test', note: 'Pharmacie du Rhône — Tournon' },
        { email: 'pharmacie.valence@pharmacie.test', note: 'Valence' },
        { email: 'pharmacie.romans@pharmacie.test', note: 'Romans' },
        { email: 'pharmacie.etoile@pharmacie.test', note: 'Étoile' },
        { email: 'pharmacie.lyon1@pharmacie.test', note: 'Lyon 1' },
        { email: 'pharmacie.lyon3@pharmacie.test', note: 'Lyon 3' },
        { email: 'pharmacie.vienne@pharmacie.test', note: 'Vienne' },
        { email: 'pharmacie.demo@pharmacie.test', note: 'Démo (pending)' },
      ],
      staff: [
        { email: 'admin@pharmacie.test', note: 'Admin' },
        { email: 'support@pharmacie.test', note: 'Support' },
        { email: 'moderator@pharmacie.test', note: 'Moderator' },
      ],
    };

export function LoginPage({ staff = false }: { staff?: boolean }) {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(staff ? 'staff' : 'patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeTab: Tab = staff ? 'staff' : tab === 'staff' ? 'patient' : tab;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="auth-hero" aria-hidden={false}>
        <h1>{staff ? t('login.staffTitle') : t('login.heroTitle')}</h1>
        {!staff && (
          <ul>
            <li>{t('login.heroPoint1')}</li>
            <li>{t('login.heroPoint2')}</li>
            <li>{t('login.heroPoint3')}</li>
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="login-title">
        <h2 id="login-title">{staff ? t('login.staffTitle') : t('login.title')}</h2>
        {!staff && (
          <div className="tabs" role="tablist" aria-label={t('login.title')}>
            {(['patient', 'doctor', 'pharmacy'] as const).map((r) => (
              <button key={r} type="button" role="tab" aria-selected={activeTab === r} onClick={() => setTab(r)}>
                {t(r === 'patient' ? 'login.tabPatient' : r === 'doctor' ? 'login.tabDoctor' : 'login.tabPharmacy')}
              </button>
            ))}
          </div>
        )}
        {!staff && <p className="muted small">{t('login.subtitle')}</p>}

        <form className="stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button className="btn block" type="submit" disabled={busy || !email || !password}>
            {busy ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <div className="row between small">
          <Link to="/forgot-password">{t('login.forgot')}</Link>
          {!staff && (
            <span>
              {t('login.noAccount')} <Link to={`/register?role=${activeTab}`}>{t('login.register')}</Link>
            </span>
          )}
        </div>

        {import.meta.env.DEV && (
          <div className="demo-panel" data-testid="demo-panel">
            <strong>{t('login.demoTitle')}</strong>
            <p className="muted small" style={{ margin: '4px 0 8px' }}>
              {t('login.demoHint')} <code>{DEMO_PASSWORD}</code>
            </p>
            <div className="row" style={{ gap: 6 }}>
              {(DEMO?.[activeTab] ?? []).map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="btn secondary small"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                  title={d.email}
                >
                  {d.note}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="small" style={{ textAlign: 'center', margin: 0 }}>
          {staff ? <Link to="/login">{t('login.backToPublic')}</Link> : <Link to="/login/staff">{t('login.staffLink')}</Link>}
        </p>
      </section>
    </div>
  );
}
