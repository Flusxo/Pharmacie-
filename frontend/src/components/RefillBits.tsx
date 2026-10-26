import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { OrderItem } from '../lib/types';
import { ForBadge, type ForMember } from './FamilyBits';
import { ErrorBox } from './ui';

interface Reminder {
  id: string;
  remindAt: string;
  medicineId: string;
  name: string;
  dosage: string;
  forMember: ForMember | null;
}
const DAYS = [7, 14, 30, 60, 90];

function useReminders() {
  const [items, setItems] = useState<Reminder[] | null>(null);
  const load = useCallback(
    () =>
      api<{ items: Reminder[] }>('/patient/reminders')
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return { items, load };
}

/** On a delivered order: "remind me to renew this in N days" for each medicine. A date only, never a dose. */
export function RefillBlock({ items }: { items: OrderItem[] }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { items: reminders, load } = useReminders();
  const [days, setDays] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const set = async (medicineId: string) => {
    setError(null);
    try {
      await api('/patient/reminders', { method: 'POST', body: { medicineId, days: days[medicineId] ?? 30 } });
      toast(t('refill.set'));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    }
  };
  const real = items.filter((i) => !i.excluded);
  if (real.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="refill-h" data-testid="refill-block">
      <h2 id="refill-h">{t('refill.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('refill.help')}
      </p>
      {error && <ErrorBox message={error} />}
      {real.map((i) => {
        const current = reminders?.find((r) => r.medicineId === i.medicineId);
        return (
          <div key={i.id} className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <strong>{i.name}</strong>
            {current ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="badge info" data-testid="reminder-set">
                  {t('refill.on', { date: formatDate(current.remindAt, locale) })}
                </span>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => void api(`/patient/reminders/${current.id}`, { method: 'DELETE' }).then(load)}
                >
                  {t('refill.remove')}
                </button>
              </span>
            ) : (
              <span className="row" style={{ gap: 8 }}>
                <label className="field" style={{ margin: 0 }}>
                  <span className="sr-only">{t('refill.in')}</span>
                  <select
                    className="input"
                    value={days[i.medicineId] ?? 30}
                    onChange={(e) => setDays({ ...days, [i.medicineId]: Number(e.target.value) })}
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {t('refill.inDays', { n: d })}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn secondary small" onClick={() => void set(i.medicineId)}>
                  {t('refill.remind')}
                </button>
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Account page: every reminder waiting, with a way to remove it. */
export function RemindersList() {
  const { t, locale } = useI18n();
  const { items, load } = useReminders();
  if (!items) return null;
  return (
    <section className="card stack" aria-labelledby="reminders-h" data-testid="reminders">
      <h2 id="reminders-h">{t('refill.listTitle')}</h2>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('refill.listEmpty')}
        </p>
      ) : (
        items.map((r) => (
          <div key={r.id} className="row between">
            <span className="stack" style={{ gap: 2 }}>
              <strong>
                {r.name} <span className="muted small">{r.dosage}</span>
              </strong>
              <span className="muted small">{t('refill.on', { date: formatDate(r.remindAt, locale) })}</span>
              <ForBadge member={r.forMember} />
            </span>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => void api(`/patient/reminders/${r.id}`, { method: 'DELETE' }).then(load)}
            >
              {t('refill.remove')}
            </button>
          </div>
        ))
      )}
    </section>
  );
}
