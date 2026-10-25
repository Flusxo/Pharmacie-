/** Shown for a moment while a page's code loads: the header, menu and footer are already there. */
import { useI18n } from '../i18n';

export function PageFallback() {
  const { t } = useI18n();
  return (
    <div className="page-fallback" role="status" aria-busy="true" data-testid="page-fallback">
      <span className="capsule-spinner" aria-hidden="true" />
      <span className="sr-only">{t('common.loading')}</span>
      <span className="sk sk-title" />
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
    </div>
  );
}
