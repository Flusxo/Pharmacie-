import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { ApiError, api } from '../lib/api';
import { useToast } from '../lib/toast';
import { ErrorBox } from './ui';

export type Relation = 'child' | 'parent' | 'partner' | 'other';
export interface FamilyMember {
  id: string;
  firstName: string;
  relation: Relation;
}
export interface ForMember {
  firstName: string;
  relation: Relation;
}
const RELATIONS: Relation[] = ['child', 'parent', 'partner', 'other'];

/** "For Léa (child)": shown wherever a request or an order made for someone else appears. */
export function ForBadge({ member }: { member?: ForMember | null }) {
  const { t } = useI18n();
  if (!member) return null;
  return (
    <span className="badge info" data-testid="for-member" style={{ width: 'fit-content' }}>
      {t('family.for', { name: member.firstName, relation: t(`family.relation.${member.relation}` as MessageKey) })}
    </span>
  );
}

/** The people of this account (patients only). */
export function useFamily() {
  const [items, setItems] = useState<FamilyMember[] | null>(null);
  const load = useCallback(
    () =>
      api<{ items: FamilyMember[] }>('/patient/family')
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return { items, reload: load };
}

/** Account page: add and remove the people this account makes requests for. */
export function FamilyPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { items, reload } = useFamily();
  const [firstName, setFirstName] = useState('');
  const [relation, setRelation] = useState<Relation>('child');
  const [error, setError] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/patient/family', { method: 'POST', body: { firstName, relation } });
      setFirstName('');
      toast(t('family.added'));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  };
  return (
    <section className="card stack" aria-labelledby="family-h" data-testid="family">
      <h2 id="family-h">{t('family.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {t('family.privacy')}
      </p>
      {error && <ErrorBox message={error} />}
      {items?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {t('family.none')}
        </p>
      )}
      {items?.map((m) => (
        <div key={m.id} className="row between" data-testid="family-member">
          <span>
            <strong>{m.firstName}</strong> <span className="muted small">({t(`family.relation.${m.relation}` as MessageKey)})</span>
          </span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => void api(`/patient/family/${m.id}`, { method: 'DELETE' }).then(reload)}
          >
            {t('family.remove')}
          </button>
        </div>
      ))}
      <form className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={add}>
        <label className="field">
          <span>{t('family.firstName')}</span>
          <input className="input" value={firstName} maxLength={40} required onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('family.relation')}</span>
          <select className="input" value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {t(`family.relation.${r}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn secondary" type="submit" disabled={!firstName.trim()}>
          {t('family.add')}
        </button>
      </form>
    </section>
  );
}
