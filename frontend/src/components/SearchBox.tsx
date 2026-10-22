import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import { duration, easeOut, stagger } from '../motion';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { IconSearch } from './Icons';

interface Suggestion {
  id: string;
  name: string;
  dosage: string;
  requiresPrescription: boolean;
}

/** Search with suggestions; fully keyboard operable (combobox pattern). */
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
