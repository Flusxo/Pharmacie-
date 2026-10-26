import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { refreshFeatures } from '../../lib/features';
import { formatDateTime } from '../../lib/format';
import { useToast } from '../../lib/toast';
import { ErrorBox } from '../ui';

interface Flag {
  name: 'messages' | 'reviews' | 'uploads' | 'slots' | 'signups';
  on: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Staff: switch a feature off or on without a new deployment. Anyone on staff can read; only an admin can change (with a reason). */
export function FeatureSwitches({ canChange }: { canChange: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api<{ items: Flag[] }>('/admin/features')
        .then((r) => setItems(r.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error'))),
    [t],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const flip = async (f: Flag) => {
    const reason = window.prompt(t(f.on ? 'feat.reasonOff' : 'feat.reasonOn', { name: t(`feat.${f.name}` as MessageKey) }));
    if (!reason || reason.trim().length < 3) return;
    setError(null);
    try {
      const r = await api<{ items: Flag[] }>(`/admin/features/${f.name}`, { method: 'PUT', body: { on: !f.on, reason } });
      setItems(r.items);
      await refreshFeatures();
      toast(t('feat.saved'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };

  if (!items && !error) return null;
  return (
    <section className="card stack" aria-labelledby="feat-h" data-testid="feature-switches">
      <h2 id="feat-h">{t('feat.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('feat.help')}
      </p>
      {error && <ErrorBox message={error} />}
      {items?.map((f) => (
        <div key={f.name} className="row between" style={{ flexWrap: 'wrap', gap: 8 }} data-testid={`feature-${f.name}`}>
          <span className="stack" style={{ gap: 2 }}>
            <strong>{t(`feat.${f.name}` as MessageKey)}</strong>
            {f.updatedAt && (
              <span className="muted small">
                {t('feat.changed', { when: formatDateTime(f.updatedAt, locale), who: f.updatedBy ?? '' })}
              </span>
            )}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <span className={`badge ${f.on ? 'ok' : 'warn'}`}>{t(f.on ? 'feat.on' : 'feat.off')}</span>
            {canChange && (
              <button type="button" className="btn secondary small" onClick={() => void flip(f)} data-testid={`flip-${f.name}`}>
                {t(f.on ? 'feat.switchOff' : 'feat.switchOn')}
              </button>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}
