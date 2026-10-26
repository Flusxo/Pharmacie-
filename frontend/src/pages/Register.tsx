import { useEffect, useState, type FormEvent } from 'react';
import { useFeatures } from '../lib/features';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { searchAddress, type BanResult } from '../lib/location';
import type { User } from '../lib/types';

type Role = 'patient' | 'doctor' | 'pharmacy';

function AddressField({ value, onPick, required }: { value: BanResult | null; onPick: (r: BanResult | null) => void; required?: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState(value?.label ?? '');
  const [results, setResults] = useState<BanResult[]>([]);
  useEffect(() => {
    if (value && q === value.label) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      searchAddress(q, ctrl.signal)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, value]);
  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor="address">
        {t('register.address')}
        {required ? ' *' : ''}
      </label>
      <input
        id="address"
        className="input"
        value={q}
        autoComplete="street-address"
        onChange={(e) => {
          setQ(e.target.value);
          onPick(null);
        }}
      />
      <span className="muted small">{t('register.addressHint')}</span>
      {results.length > 0 && !value && (
        <ul className="suggestions" role="listbox">
          {results.map((r) => (
            <li
              key={r.label}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() => {
                onPick(r);
                setQ(r.label);
                setResults([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onPick(r);
                  setQ(r.label);
                  setResults([]);
                }
              }}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  const features = useFeatures();
  const [params] = useSearchParams();
  const initial = params.get('role');
  const [role, setRole] = useState<Role>(initial === 'doctor' || initial === 'pharmacy' ? initial : 'patient');
  const [f, setF] = useState<Record<string, string>>({});
  const [addr, setAddr] = useState<BanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!features.signups) {
      setError(t('feat.signupsOff'));
      return;
    }
    if (role === 'pharmacy' && !addr) {
      setError(t('register.addressRequired'));
      return;
    }
    setBusy(true);
    const common = { email: f.email ?? '', password: f.password ?? '' };
    const body =
      role === 'patient'
        ? {
            ...common,
            firstName: f.firstName ?? '',
            lastName: f.lastName ?? '',
            birthDate: f.birthDate || undefined,
            phone: f.phone || undefined,
            address: addr?.label,
            latitude: addr?.lat,
            longitude: addr?.lon,
          }
        : role === 'doctor'
          ? {
              ...common,
              firstName: f.firstName ?? '',
              lastName: f.lastName ?? '',
              rpps: f.rpps ?? '',
              speciality: f.speciality || undefined,
            }
          : {
              ...common,
              name: f.name ?? '',
              finess: f.finess ?? '',
              phone: f.phone || undefined,
              address: addr!.label,
              city: addr!.city,
              latitude: addr!.lat,
              longitude: addr!.lon,
            };
    try {
      const r = await api<{ token: string; user: User }>(`/auth/register/${role}`, { method: 'POST', body });
      acceptSession(r.token, r.user);
      navigate(homeFor(r.user), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const input = (k: string, label: string, type = 'text', extra: Record<string, string | boolean> = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} className="input" type={type} value={f[k] ?? ''} onChange={set(k)} {...extra} />
    </div>
  );

  return (
    <div className="card stack" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>{t('register.title')}</h1>
      <div className="tabs" role="tablist">
        {(['patient', 'doctor', 'pharmacy'] as const).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)}>
            {t(r === 'patient' ? 'register.asPatient' : r === 'doctor' ? 'register.asDoctor' : 'register.asPharmacy')}
          </button>
        ))}
      </div>
      {role !== 'patient' && <div className="alert info">{t('register.proNotice')}</div>}
      {!features.signups && (
        <p className="alert warn" role="status" data-testid="signups-closed">
          {t('feat.signupsOff')}
        </p>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        {role === 'pharmacy' ? (
          <>
            {input('name', t('register.pharmacyName'), 'text', { required: true })}
            {input('finess', t('register.finess'), 'text', { inputMode: 'numeric', required: true })}
          </>
        ) : (
          <div className="grid cols-2">
            {input('firstName', t('register.firstName'), 'text', { autoComplete: 'given-name', required: true })}
            {input('lastName', t('register.lastName'), 'text', { autoComplete: 'family-name', required: true })}
          </div>
        )}
        {role === 'doctor' && (
          <div className="grid cols-2">
            {input('rpps', t('register.rpps'), 'text', { inputMode: 'numeric', required: true })}
            {input('speciality', t('register.speciality'))}
          </div>
        )}
        {role === 'patient' && input('birthDate', t('register.birthDate'), 'date')}
        {role !== 'doctor' && <AddressField value={addr} onPick={setAddr} required={role === 'pharmacy'} />}
        {role !== 'doctor' && input('phone', t('register.phone'), 'tel', { autoComplete: 'tel' })}
        {input('email', t('login.email'), 'email', { autoComplete: 'email', required: true })}
        <div className="field">
          <label htmlFor="password">{t('login.password')}</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={f.password ?? ''}
            onChange={set('password')}
            minLength={10}
            required
          />
          <span className="muted small">{t('register.passwordHint')}</span>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button className="btn block" type="submit" disabled={busy}>
          {t('register.submit')}
        </button>
      </form>
      <p className="small">
        {t('register.haveAccount')} <Link to="/login">{t('login.submit')}</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card stack"
      style={{ maxWidth: 520, margin: '0 auto' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const r = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } });
          setMsg(r.message);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : t('common.error'));
        }
      }}
    >
      <h1>{t('forgot.title')}</h1>
      <p className="muted">{t('forgot.text')}</p>
      <div className="field">
        <label htmlFor="email">{t('login.email')}</label>
        <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert error">{error}</div>}
      {import.meta.env.DEV && <p className="muted small">{t('forgot.devHint')}</p>}
      <button className="btn" type="submit" disabled={!email}>
        {t('forgot.submit')}
      </button>
      <Link to="/login">{t('common.back')}</Link>
    </form>
  );
}

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card stack"
      style={{ maxWidth: 520, margin: '0 auto' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token') ?? '', password } });
          setDone(true);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : t('common.error'));
        }
      }}
    >
      <h1>{t('reset.title')}</h1>
      <div className="field">
        <label htmlFor="pw">{t('profile.newPassword')}</label>
        <input
          id="pw"
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="muted small">{t('register.passwordHint')}</span>
      </div>
      {done && (
        <div className="alert ok">
          {t('reset.done')} <Link to="/login">{t('login.submit')}</Link>
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
      <button className="btn" type="submit" disabled={!password || done}>
        {t('reset.submit')}
      </button>
    </form>
  );
}
