import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';

interface Entry {
  id: number;
  when: string;
  kind: 'request' | 'order' | 'prescription' | 'doctor' | 'staff';
  role: 'pharmacy' | 'doctor' | 'staff';
  label: string;
}
const PAGE = 15;

/** Account page: who opened this person's data, in plain words, newest first (last 12 months). */
export function AccessLogPanel() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    api<{ items: Entry[] }>('/patient/access-log')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  if (!items) return null;
  return (
    <section className="card stack" aria-labelledby="access-h" data-testid="access-log">
      <h2 id="access-h">{t('access.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('access.intro')}
      </p>
      {items.length === 0 ? (
        <p style={{ margin: 0 }}>{t('access.none')}</p>
      ) : (
        <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {items.slice(0, shown).map((e) => (
            <li key={e.id} className="stack" style={{ gap: 0 }} data-testid="access-entry">
              <span>{t(`access.${e.kind}` as MessageKey, { who: e.label })}</span>
              <span className="muted small">{formatDateTime(e.when, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      {items.length > shown && (
        <button type="button" className="btn ghost small" style={{ width: 'fit-content' }} onClick={() => setShown(shown + PAGE)}>
          {t('access.more')}
        </button>
      )}
    </section>
  );
}
