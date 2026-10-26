import { useState } from 'react';
import { FileManager } from '../components/PrivateFiles';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { homeFor, useAuth } from '../lib/auth';
import { CapsuleVisual } from '../components/three/ThreeVisuals';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
      <CapsuleVisual />
      <h1>{t('notFound.title')}</h1>
      <p className="muted">{t('notFound.text')}</p>
      <Link to="/" className="btn">
        {t('notFound.home')}
      </Link>
    </div>
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
      <div style={{ textAlign: 'left' }}>
        <FileManager
          title={t('files.verifTitle')}
          help={t('files.verifHelp')}
          listPath="/me/verification-files"
          uploadPath="/me/verification-files"
          deletePath={(fid) => `/me/verification-files/${fid}`}
          testId="verification-files"
        />
      </div>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const fresh = await refresh().catch(() => null);
          setBusy(false);
          // Verified now → the dashboard; still pending → stays here (RequireRole sends it back).
          navigate(fresh ? homeFor(fresh) : '/login', { replace: true });
        }}
      >
        {t('waiting.refresh')}
      </button>
    </div>
  );
}

/** "/" sends each role to its home. */
