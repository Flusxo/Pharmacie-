import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useToast } from '../../lib/toast';
import { CardSkeleton, Empty, ErrorBox } from '../ui';

interface Member {
  id: string;
  email: string;
  displayName: string;
  role: 'pharmacist' | 'assistant';
  createdAt: string;
}

/** The owner adds and removes pharmacists and assistants. */
export function TeamTab() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', role: 'assistant' as Member['role'] });
  const load = useCallback(
    () =>
      api<{ items: Member[] }>('/pharmacy/team')
        .then((r) => setItems(r.items))
        .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error'))),
    [t],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/pharmacy/team', { method: 'POST', body: form });
      toast(t('team.added'));
      setForm({ displayName: '', email: '', password: '', role: 'assistant' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };
  const remove = async (m: Member) => {
    if (!window.confirm(t('team.confirmRemove', { name: m.displayName }))) return;
    try {
      await api(`/pharmacy/team/${m.id}`, { method: 'DELETE' });
      toast(t('team.removed'));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted small">{t('team.intro')}</p>
      {error && <ErrorBox message={error} />}
      <form className="card stack" onSubmit={add} data-testid="team-form">
        <h2>{t('team.add')}</h2>
        <div className="grid cols-2">
          <label className="field">
            <span>{t('team.name')}</span>
            <input
              className="input"
              required
              minLength={2}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('team.email')}</span>
            <input
              className="input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('team.password')}</span>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('team.role')}</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Member['role'] })}>
              <option value="assistant">{t('team.role.assistant')}</option>
              <option value="pharmacist">{t('team.role.pharmacist')}</option>
            </select>
          </label>
        </div>
        <p className="muted small">{t(`team.roleHelp.${form.role}` as MessageKey)}</p>
        <button className="btn" type="submit">
          {t('team.addButton')}
        </button>
      </form>
      {!items ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <Empty>{t('team.empty')}</Empty>
      ) : (
        <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0 }}>
          {items.map((m) => (
            <li key={m.id} className="card row between" data-testid="team-member">
              <span className="stack" style={{ gap: 2 }}>
                <strong>{m.displayName}</strong>
                <span className="muted small">
                  {m.email} · {t(`team.role.${m.role}` as MessageKey)}
                </span>
              </span>
              <button type="button" className="btn ghost small" onClick={() => void remove(m)}>
                {t('team.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Activity {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  target: string | null;
  createdAt: string;
}

/** Action key stored as "METHOD /route/:param"; shown as a sentence. */
const ACTIONS: Record<string, MessageKey> = {
  'POST /requests/:id/accept': 'activity.accept',
  'POST /requests/:id/refuse': 'activity.refuse',
  'POST /requests/:id/substitutions': 'activity.substitution',
  'PATCH /orders/:id/status': 'activity.orderStatus',
  'POST /orders/:id/cancellation': 'activity.cancellation',
  'PUT /inventory/:medicineId': 'activity.stockSet',
  'DELETE /inventory/:medicineId': 'activity.stockRemove',
  'POST /inventory/csv': 'activity.csv',
  'PATCH /settings': 'activity.settings',
  'PATCH /profile': 'activity.profile',
  'POST /orders/:id/pickup': 'activity.pickup',
  'POST /medicines': 'activity.propose',
  'POST /team': 'activity.teamAdd',
  'DELETE /team/:id': 'activity.teamRemove',
};

export function ActivityTab() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: Activity[] }>('/pharmacy/activity')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')));
  }, [t]);
  if (error) return <ErrorBox message={error} />;
  if (!items) return <CardSkeleton />;
  if (items.length === 0) return <Empty>{t('activity.empty')}</Empty>;
  return (
    <div className="card table-wrap">
      <table className="table" data-testid="activity-table">
        <thead>
          <tr>
            <th>{t('activity.when')}</th>
            <th>{t('activity.who')}</th>
            <th>{t('activity.what')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>{formatDateTime(a.createdAt, locale)}</td>
              <td>
                {a.actorName || t('team.role.owner')} <span className="muted small">({t(`team.role.${a.actorRole}` as MessageKey)})</span>
              </td>
              <td>{ACTIONS[a.action] ? t(ACTIONS[a.action]) : a.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
