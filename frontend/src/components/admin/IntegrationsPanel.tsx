import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { api } from '../../lib/api';

interface Integrations {
  email: { configured: boolean };
  errorAlerts: { configured: boolean };
  payments: { configured: boolean };
  push: { built: boolean };
  storage: { built: boolean };
}

/** Staff: which optional services are set up. Without one, its feature shows a clean "not configured" state. */
export function IntegrationsPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Integrations | null>(null);
  useEffect(() => {
    api<Integrations>('/admin/integrations')
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  const rows: { key: string; label: MessageKey; state: 'on' | 'off' | 'unbuilt' }[] = [
    { key: 'email', label: 'integ.email', state: data.email.configured ? 'on' : 'off' },
    { key: 'errors', label: 'integ.errorAlerts', state: data.errorAlerts.configured ? 'on' : 'off' },
    { key: 'payments', label: 'integ.payments', state: data.payments.configured ? 'on' : 'off' },
    { key: 'push', label: 'integ.push', state: 'unbuilt' },
    { key: 'storage', label: 'integ.storage', state: 'unbuilt' },
  ];
  return (
    <section className="card stack" aria-labelledby="integ-h" data-testid="integrations">
      <h2 id="integ-h">{t('integ.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('integ.help')}
      </p>
      <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li key={r.key} className="row between">
            <span>{t(r.label)}</span>
            <span className={`badge ${r.state === 'on' ? 'ok' : 'neutral'}`}>
              {t(r.state === 'on' ? 'integ.on' : r.state === 'off' ? 'integ.off' : 'integ.unbuilt')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
