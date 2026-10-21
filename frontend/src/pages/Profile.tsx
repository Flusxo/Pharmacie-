import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { ApiError, api, getToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSettings, type ThemePref } from '../lib/settings';
import { useToast } from '../lib/toast';

interface DoctorLink {
  id: string;
  firstName: string;
  lastName: string;
  speciality: string;
  confirmed: boolean;
}

export function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme, reduceMotion, setReduceMotion } = useSettings();
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<DoctorLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [report, setReport] = useState({ subject: '', message: '' });
  const [deletePw, setDeletePw] = useState('');
  const isPatient = user?.role === 'patient';

  const loadDoctors = () =>
    api<{ items: DoctorLink[] }>('/patient/doctors')
      .then((r) => setDoctors(r.items))
      .catch(() => setDoctors([]));
  useEffect(() => {
    if (isPatient) void loadDoctors();
  }, [isPatient]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  const exportData = async () => {
    const res = await fetch('/api/patient/export', { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'counter-my-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!user) return null;
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 760, margin: '0 auto' }}>
      <h1>{t('profile.title')}</h1>
      <p className="muted">
        {user.displayName} · {user.email}
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <section className="card stack">
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="lang">{t('profile.language')}</label>
            <select id="lang" className="input" value={lang} onChange={(e) => setLang(e.target.value as 'fr' | 'en')}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="theme">{t('profile.theme')}</label>
            <select id="theme" className="input" value={theme} onChange={(e) => setTheme(e.target.value as ThemePref)}>
              <option value="system">{t('profile.themeSystem')}</option>
              <option value="light">{t('profile.themeLight')}</option>
              <option value="dark">{t('profile.themeDark')}</option>
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} data-testid="reduce-motion" />
          <span>{t('profile.reduceMotion')}</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={user.emailNotifications}
            onChange={(e) =>
              void run(async () => {
                await api('/auth/me/preferences', { method: 'PATCH', body: { emailNotifications: e.target.checked } });
                await refresh();
              }, t('profile.saved'))
            }
          />
          <span>{t('profile.emailNotifications')}</span>
        </label>
      </section>

      {isPatient && (
        <section className="card stack">
          <h2>{t('profile.doctors')}</h2>
          {doctors?.length === 0 && <p className="muted">{t('profile.noDoctors')}</p>}
          {doctors?.map((d) => (
            <div key={d.id} className="row between">
              <span className="stack" style={{ gap: 2 }}>
                <strong>
                  Dr {d.firstName} {d.lastName}
                </strong>
                <span className="muted small">
                  {d.speciality}
                  {!d.confirmed ? ` · ${t('profile.pendingLink')}` : ''}
                </span>
              </span>
              <span className="row">
                {!d.confirmed && (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => void run(() => api(`/patient/doctors/${d.id}/confirm`, { method: 'POST' }).then(loadDoctors))}
                  >
                    {t('profile.confirmLink')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => void run(() => api(`/patient/doctors/${d.id}`, { method: 'DELETE' }).then(loadDoctors))}
                >
                  {t('profile.removeLink')}
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api('/auth/change-password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
            setPw({ current: '', next: '' });
          }, t('profile.saved'));
        }}
      >
        <h2>{t('profile.changePassword')}</h2>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="cur">{t('profile.currentPassword')}</label>
            <input
              id="cur"
              className="input"
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="new">{t('profile.newPassword')}</label>
            <input
              id="new"
              className="input"
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </div>
        </div>
        <button className="btn secondary" type="submit" disabled={!pw.current || !pw.next}>
          {t('common.save')}
        </button>
      </form>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api('/reports', { method: 'POST', body: report });
            setReport({ subject: '', message: '' });
          }, t('profile.reportSent'));
        }}
      >
        <h2>{t('profile.report')}</h2>
        <div className="field">
          <label htmlFor="rs">{t('profile.reportSubject')}</label>
          <input id="rs" className="input" value={report.subject} onChange={(e) => setReport({ ...report, subject: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="rm">{t('profile.reportMessage')}</label>
          <textarea id="rm" className="input" value={report.message} onChange={(e) => setReport({ ...report, message: e.target.value })} />
        </div>
        <button className="btn secondary" type="submit" disabled={!report.subject || !report.message}>
          {t('common.save')}
        </button>
      </form>

      {isPatient && (
        <section className="card stack">
          <button type="button" className="btn secondary" onClick={() => void run(exportData)}>
            {t('profile.export')}
          </button>
          <p className="muted small">{t('profile.deleteConfirm')}</p>
          <div className="row">
            <label htmlFor="delpw" className="sr-only">
              {t('login.password')}
            </label>
            <input
              id="delpw"
              className="input"
              style={{ flex: 1 }}
              type="password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
            />
            <button
              type="button"
              className="btn danger"
              disabled={!deletePw}
              onClick={() =>
                void run(async () => {
                  await api('/patient/account', { method: 'DELETE', body: { password: deletePw } });
                  logout();
                  navigate('/login');
                }, t('profile.deleted'))
              }
            >
              {t('profile.delete')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
