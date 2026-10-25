import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

/** Shown while the browser reports no network connection. */
export function OfflineBanner() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const down = () => setOffline(true);
    const up = () => setOffline(false);
    window.addEventListener('offline', down);
    window.addEventListener('online', up);
    return () => {
      window.removeEventListener('offline', down);
      window.removeEventListener('online', up);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="waking-banner" role="status" aria-live="polite" data-testid="offline-banner">
      <span>
        <strong>{t('offline.title')}</strong> {t('offline.body')}
      </span>
    </div>
  );
}
