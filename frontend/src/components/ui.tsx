import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/fr';
import { openState } from '../lib/format';
import type { OpeningHours } from '../lib/types';

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card stack" aria-busy="true">
      <Skeleton h={22} w="60%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={14} w={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="alert error row between" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn secondary small" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  received: 'warn',
  sent_to_pharmacy: 'info',
  awaiting_patient_approval: 'warn',
  accepted: 'ok',
  preparing: 'info',
  ready: 'ok',
  out_for_delivery: 'info',
  delivered: 'ok',
  cancelled: 'bad',
  expired: 'bad',
  pending: 'warn',
  active: 'ok',
  suspended: 'bad',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const key = `status.${status}` as MessageKey;
  return <span className={`badge ${STATUS_TONE[status] ?? 'neutral'}`}>{t(key)}</span>;
}

export function RxBadge({ rx }: { rx: boolean }) {
  const { t } = useI18n();
  return rx ? <span className="badge info">{t('common.prescription')}</span> : null;
}

export function OpenBadge({ hours, onDuty }: { hours: OpeningHours; onDuty: string[] }) {
  const { t } = useI18n();
  const s = openState(hours, onDuty);
  if (s.kind === 'duty') return <span className="badge ok">{t('hours.onDuty')}</span>;
  if (s.kind === 'open')
    return (
      <span className="badge ok">
        {t('hours.openNow')} · {t('hours.closesAt', { time: s.closesAt })}
      </span>
    );
  return (
    <span className="badge neutral">
      {s.opensAt ? `${t('hours.closed')} · ${t('hours.opensAt', { time: s.opensAt })}` : t('hours.closed')}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card muted" style={{ textAlign: 'center', padding: 28 }}>
      {children}
    </div>
  );
}
