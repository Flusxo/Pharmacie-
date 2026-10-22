import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { onWaking } from '../lib/apiBase';

/** Shown while the free hosted backend wakes up (the first request after a pause takes up to a minute). */
export function WakingBanner() {
  const { t } = useI18n();
  const [waking, setWaking] = useState(false);
  useEffect(() => onWaking(setWaking), []);
  if (!waking) return null;
  return (
    <div className="waking-banner" role="status" aria-live="polite" data-testid="waking-banner">
      <span className="waking-spinner" aria-hidden="true" />
      <span>
        <strong>{t('waking.title')}</strong> {t('waking.body')}
      </span>
    </div>
  );
}
