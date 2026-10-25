import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { CardSkeleton } from './ui';

interface Session {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** A readable device name from the browser's user-agent text (browser and system only, nothing else is kept). */
export function deviceName(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ');
}

/** Account page: the devices that are logged in, with a way to sign one out or all of them. */
export function DevicesPanel() {
  const { t, locale } = useI18n();
  const { logout } = useAuth();
  const [items, setItems] = useState<Session[] | null>(null);
  const load = useCallback(
    () =>
      api<{ items: Session[] }>('/auth/sessions')
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="card stack" aria-labelledby="devices-h" data-testid="devices">
      <h2 id="devices-h">{t('devices.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('devices.help')}
      </p>
      {!items ? (
        <CardSkeleton lines={2} />
      ) : (
        items.map((s) => (
          <div key={s.id} className="row between" data-testid="device">
            <span className="stack" style={{ gap: 2 }}>
              <strong>
                {deviceName(s.userAgent) || t('devices.unknown')} {s.current && <span className="badge ok">{t('devices.current')}</span>}
              </strong>
              <span className="muted small">{t('devices.lastSeen', { when: formatDateTime(s.lastSeenAt, locale) })}</span>
            </span>
            {!s.current && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => void api(`/auth/sessions/${s.id}`, { method: 'DELETE' }).then(load)}
              >
                {t('devices.signOut')}
              </button>
            )}
          </div>
        ))
      )}
      <button
        type="button"
        className="btn secondary"
        onClick={() => void api('/auth/logout-all', { method: 'POST' }).then(() => logout())}
        data-testid="logout-all"
      >
        {t('devices.signOutAll')}
      </button>
    </section>
  );
}
