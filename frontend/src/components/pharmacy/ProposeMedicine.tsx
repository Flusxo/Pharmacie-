import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { formatDateTime } from '../../lib/format';

const FORMS = ['tablet', 'capsule', 'syrup', 'drops', 'cream', 'sachet', 'spray', 'inhaler', 'pen', 'lozenge'];

interface Candidate {
  id: string;
  name: string;
  dosage: string;
  form: string;
  cip13: string;
}
interface Proposal {
  id: string;
  name: string;
  dosage: string;
  cip13: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  submittedAt: string;
}
const EMPTY = {
  cip13: '',
  name: '',
  activeSubstance: '',
  form: 'tablet',
  dosage: '',
  category: '',
  requiresPrescription: false,
  description: '',
  quantity: '',
  price: '',
};

/**
 * A pharmacy proposes a medicine that is not in the catalogue. Look-alikes are shown before anything is stored; the
 * proposal stays "pending" (invisible to patients) until staff approve it.
 */
export function ProposeMedicine({ onSaved }: { onSaved: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [hard, setHard] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const loadProposals = useCallback(() => {
    api<{ items: Proposal[] }>('/pharmacy/medicines/proposals')
      .then((r) => setProposals(r.items))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadProposals();
    api<{ items: { category: string }[] }>('/medicines/categories')
      .then((r) => setCategories(r.items.map((c) => c.category)))
      .catch(() => {});
  }, [loadProposals]);

  const set = (k: keyof typeof EMPTY, v: string | boolean) => {
    setF((x) => ({ ...x, [k]: v }));
    setCandidates(null);
    setHard(false);
  };

  async function send(confirmNew: boolean) {
    setBusy(true);
    setError(null);
    try {
      const qty = f.quantity.trim() === '' ? undefined : Number(f.quantity);
      const price = Number(f.price.replace(',', '.'));
      await api('/pharmacy/medicines', {
        method: 'POST',
        body: {
          cip13: f.cip13.trim(),
          name: f.name,
          activeSubstance: f.activeSubstance,
          form: f.form,
          dosage: f.dosage,
          category: f.category,
          requiresPrescription: f.requiresPrescription,
          description: f.description || undefined,
          confirmNew,
          stock: qty !== undefined && Number.isFinite(price) && f.price.trim() !== '' ? { quantity: qty, priceEur: price } : undefined,
        },
      });
      toast(t('ph.propose.sent'));
      setF(EMPTY);
      setCandidates(null);
      loadProposals();
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'possible_duplicate' || e.code === 'duplicate_cip13')) {
        setCandidates(((e.details as { candidates?: Candidate[] } | undefined)?.candidates ?? []) as Candidate[]);
        setHard(e.code === 'duplicate_cip13');
      } else {
        setError(e instanceof ApiError ? e.message : t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(false);
  };
  const field = (
    k: keyof typeof EMPTY,
    label: string,
    extra: { type?: string; list?: string; required?: boolean; pattern?: string } = {},
  ) => (
    <div className="field">
      <label htmlFor={`pm-${k}`}>{label}</label>
      <input
        id={`pm-${k}`}
        className="input"
        type={extra.type ?? 'text'}
        list={extra.list}
        required={extra.required ?? true}
        pattern={extra.pattern}
        value={String(f[k])}
        onChange={(e) => set(k, e.target.value)}
      />
    </div>
  );

  return (
    <details className="card stack" data-testid="propose-medicine">
      <summary>
        <strong>{t('ph.propose.title')}</strong>
      </summary>
      <p className="muted small">{t('ph.propose.intro')}</p>
      <form className="stack" onSubmit={submit}>
        <div className="grid cols-2">
          {field('cip13', t('ph.propose.cip13'), { pattern: '\\d{13}' })}
          {field('name', t('dash.name'))}
          {field('activeSubstance', t('ph.propose.substance'))}
          {field('dosage', t('ph.propose.dosage'))}
          <div className="field">
            <label htmlFor="pm-form">{t('ph.propose.form')}</label>
            <select id="pm-form" className="input" value={f.form} onChange={(e) => set('form', e.target.value)}>
              {FORMS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div>
            {field('category', t('ph.propose.category'), { list: 'pm-categories' })}
            <datalist id="pm-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {field('quantity', t('ph.propose.stock'), { type: 'number', required: false })}
          {field('price', t('ph.price'), { required: false })}
        </div>
        <label className="check">
          <input type="checkbox" checked={f.requiresPrescription} onChange={(e) => set('requiresPrescription', e.target.checked)} />
          <span>{t('ph.propose.rx')}</span>
        </label>
        {field('description', t('ph.propose.description'), { required: false })}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {candidates && candidates.length > 0 && (
          <div className="alert warn" role="alert" data-testid="duplicate-warning">
            <strong>{hard ? t('ph.propose.sameCode') : t('ph.propose.similar')}</strong>
            <ul className="plain-list">
              {candidates.map((c) => (
                <li key={c.id}>
                  {c.name} — {c.dosage} · {c.form} · {c.cip13}
                </li>
              ))}
            </ul>
            {!hard && (
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                onClick={() => void send(true)}
                data-testid="confirm-new"
              >
                {t('ph.propose.different')}
              </button>
            )}
          </div>
        )}
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {t('ph.propose.submit')}
          </button>
        </div>
      </form>
      {proposals.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h4 style={{ margin: 0 }}>{t('ph.propose.mine')}</h4>
          <ul className="plain-list" data-testid="my-proposals">
            {proposals.map((p) => (
              <li key={p.id} className="row between">
                <span>
                  {p.name} — {p.dosage} <span className="muted small">· {formatDateTime(p.submittedAt, locale)}</span>
                  {p.reviewNote && <span className="muted small"> · {p.reviewNote}</span>}
                </span>
                <span className={`badge ${p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'}`}>
                  {t(`ph.propose.status.${p.status}` as MessageKey)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
