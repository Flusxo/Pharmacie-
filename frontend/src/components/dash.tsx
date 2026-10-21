/** Shared building blocks for the professional dashboards. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';

export interface MedicineHit {
  id: string;
  name: string;
  dosage: string;
  form: string;
  category: string;
  requiresPrescription: boolean;
}

/** Medicine search with suggestions (keyboard: arrows + Enter). Calls onPick with the chosen medicine. */
export function MedicinePicker({ onPick, label, id = 'med-pick' }: { onPick: (m: MedicineHit) => void; label: string; id?: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MedicineHit[]>([]);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api<{ items: MedicineHit[] }>('/medicines/suggest', { query: { q }, signal: ctrl.signal })
        .then((r) => {
          setItems(r.items);
          setActive(-1);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  const pick = (m: MedicineHit) => {
    onPick(m);
    setQ('');
    setItems([]);
  };
  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={`${id}-list`}
        placeholder={t('home.searchPlaceholder')}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && items[Math.max(0, active)]) {
            e.preventDefault();
            pick(items[Math.max(0, active)]);
          }
        }}
      />
      {items.length > 0 && (
        <ul id={`${id}-list`} className="suggestions" role="listbox">
          {items.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              <span>
                {m.name} <span className="muted small">{m.dosage}</span>
              </span>
              {m.requiresPrescription && <span className="badge info">{t('common.prescription')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Small modal asking for a reason (required or optional) before a sensitive action. */
export function ReasonDialog({
  title,
  required,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  required: boolean;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const ok = !required || reason.trim().length >= 3;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onConfirm(reason.trim());
        }}
      >
        <h2 id="reason-title">{title}</h2>
        <div className="field">
          <label htmlFor="reason">{required ? t('dash.reason') : t('dash.optionalReason')}</label>
          <textarea id="reason" ref={ref} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          {required && !ok && reason.length > 0 && <span className="field-error">{t('dash.reasonRequired')}</span>}
        </div>
        <div className="row">
          <button type="button" className="btn secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn" disabled={!ok} style={{ flex: 1 }}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Live countdown ring until a deadline (the pharmacy's 30-minute response window). */
export function CountdownRing({ until, totalMinutes = 30 }: { until: string; totalMinutes?: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  const frac = Math.min(1, left / (totalMinutes * 60_000));
  const mins = Math.ceil(left / 60_000);
  const color = frac > 0.5 ? 'var(--green-500)' : frac > 0.2 ? 'var(--amber)' : 'var(--red)';
  const r = 18;
  const c = 2 * Math.PI * r;
  const label = left === 0 ? t('ph.expired') : t('ph.timeLeft', { min: mins });
  return (
    <span className="row" style={{ gap: 8 }} role="timer" aria-label={label}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
        <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
          {mins}
        </text>
      </svg>
      <span className="small">{label}</span>
    </span>
  );
}

export function Kpi({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
}) {
  return (
    <div className={`card kpi kpi-${tone}`}>
      <span className="muted small">{label}</span>
      <strong className="kpi-value">{value}</strong>
    </div>
  );
}

/** Tab bar with ARIA roles; returns the active key. */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: K; label: ReactNode }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tb) => (
        <button key={tb.key} type="button" role="tab" aria-selected={value === tb.key} onClick={() => onChange(tb.key)}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}
