import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { homeFor, useAuth } from '../lib/auth';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
      <h1>{t('notFound.title')}</h1>
      <p className="muted">{t('notFound.text')}</p>
      <Link to="/" className="btn">
        {t('notFound.home')}
      </Link>
    </div>
  );
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useI18n();
  return (
    <article className="card stack" style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1>{t(kind === 'terms' ? 'legal.termsTitle' : 'legal.privacyTitle')}</h1>
      <p>{t('legal.placeholder')}</p>
      <p className="muted">{t('app.notice')}</p>
    </article>
  );
}

/** Doctors and pharmacies that are not verified yet land here. */
export function WaitingPage() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  const reason = user.doctor?.rejectionReason ?? user.pharmacy?.rejectionReason ?? null;
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }} data-testid="waiting">
      <div style={{ fontSize: 48 }} aria-hidden="true">
        ⏳
      </div>
      <h1>{t('waiting.title')}</h1>
      <p className="muted">{t('waiting.text')}</p>
      {reason && <div className="alert error">{t('waiting.rejected', { reason })}</div>}
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refresh().catch(() => {});
          setBusy(false);
          navigate('/', { replace: true });
        }}
      >
        {t('waiting.refresh')}
      </button>
    </div>
  );
}

/** "/" sends each role to its home. */
export function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}
