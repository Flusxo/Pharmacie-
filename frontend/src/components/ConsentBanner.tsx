import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export const CONSENT_KEY = 'counter.consent';

const seen = (): boolean => {
  try {
    return localStorage.getItem(CONSENT_KEY) !== null;
  } catch {
    return true;
  }
};

/**
 * Storage notice. counter. sets no advertising or tracking cookies and has no analytics, so there is nothing to opt
 * into: the notice says so, links to the privacy page, and is dismissed once. If a tracker is ever added it must get
 * its own switch here, off by default.
 */
export function ConsentBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'essential');
    } catch {
      /* not remembered: the notice shows again next time */
    }
    setOpen(false);
  };
  return (
    <section className="consent glass" role="region" aria-label={t('consent.title')} data-testid="consent">
      <div className="stack" style={{ gap: 4 }}>
        <strong>{t('consent.title')}</strong>
        <span className="small">{t('consent.text')}</span>
      </div>
      <span className="row" style={{ gap: 8 }}>
        <Link className="btn ghost small" to="/privacy" onClick={close}>
          {t('consent.more')}
        </Link>
        <button type="button" className="btn small" onClick={close}>
          {t('consent.ok')}
        </button>
      </span>
    </section>
  );
}
