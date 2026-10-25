import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import { duration, easeOut, stagger } from '../motion';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { IconSearch } from './Icons';
import { BarcodeScan } from './pharmacy/BarcodeScan';

interface Suggestion {
  id: string;
  name: string;
  dosage: string;
  requiresPrescription: boolean;
}

const RECENT_KEY = 'counter.recentSearches';
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
};
const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: recent searches are a convenience only */
  }
};

/** Search with suggestions and the last five searches (kept in this browser only); fully keyboard operable (combobox pattern). */
export function SearchBox({
  initial = '',
  autoFocus = false,
  onSubmit,
}: {
  initial?: string;
  autoFocus?: boolean;
  onSubmit?: (q: string) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const [recent, setRecent] = useState<string[]>(readRecent);
  const remember = (value: string) => {
    const v = value.trim();
    if (v.length < 2) return;
    const next = [v, ...recent.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, 5);
    setRecent(next);
    writeRecent(next);
  };

  useEffect(() => setQ(initial), [initial]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api<{ items: Suggestion[] }>('/medicines/suggest', { query: { q }, signal: ctrl.signal })
        .then((r) => {
          setItems(r.items);
          setActive(-1);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const submit = (value: string) => {
    setOpen(false);
    remember(value);
    if (onSubmit) onSubmit(value);
    else navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && items[active]) navigate(`/medicines/${items[active].id}`);
      else submit(q);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="search-box">
      <IconSearch />
      <label htmlFor={`${listId}-input`} className="sr-only">
        {t('home.searchLabel')}
      </label>
      <input
        id={`${listId}-input`}
        className="input"
        type="search"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={t('home.searchPlaceholder')}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        data-testid="search-input"
      />
      <BarcodeScan onCode={(code) => submit(code)} />
      {open && q.trim() === '' && recent.length > 0 && (
        <ul className="suggestions" aria-label={t('search.recent')} data-testid="recent-searches">
          <li className="muted small" aria-hidden="true">
            {t('search.recent')}
          </li>
          {recent.map((r) => (
            <li
              key={r}
              onMouseDown={(e) => {
                e.preventDefault();
                setQ(r);
                submit(r);
              }}
            >
              <span>{r}</span>
            </li>
          ))}
          <li
            className="muted small"
            onMouseDown={(e) => {
              e.preventDefault();
              setRecent([]);
              writeRecent([]);
            }}
          >
            {t('search.clearRecent')}
          </li>
        </ul>
      )}
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="suggestions">
          {items.map((s, i) => (
            <motion.li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.fast, ease: easeOut, delay: i * stagger * 0.6 }}
              onMouseDown={(e) => {
                e.preventDefault();
                remember(s.name);
                navigate(`/medicines/${s.id}`);
              }}
            >
              <span>
                {s.name} <span className="muted small">{s.dosage}</span>
              </span>
              {s.requiresPrescription && <span className="badge info">{t('common.prescription')}</span>}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
