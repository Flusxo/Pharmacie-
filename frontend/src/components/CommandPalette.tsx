import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

interface Item {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Pages a person can reach, by role. Labels are existing translations. */
const PAGES: Record<string, { to: string; key: MessageKey }[]> = {
  guest: [
    { to: '/', key: 'nav.home' as MessageKey },
    { to: '/how-it-works', key: 'pub.nav.how' as MessageKey },
    { to: '/login', key: 'login.title' as MessageKey },
    { to: '/register', key: 'register.title' as MessageKey },
  ],
  patient: [
    { to: '/home', key: 'nav.home' as MessageKey },
    { to: '/search', key: 'nav.search' as MessageKey },
    { to: '/map', key: 'nav.map' as MessageKey },
    { to: '/requests', key: 'nav.requests' as MessageKey },
    { to: '/profile', key: 'nav.profile' as MessageKey },
  ],
  doctor: [
    { to: '/doctor', key: 'nav.dashboard' as MessageKey },
    { to: '/profile', key: 'nav.profile' as MessageKey },
  ],
  pharmacy: [
    { to: '/pharmacy', key: 'nav.dashboard' as MessageKey },
    { to: '/profile', key: 'nav.profile' as MessageKey },
  ],
  staff: [
    { to: '/admin', key: 'nav.dashboard' as MessageKey },
    { to: '/profile', key: 'nav.profile' as MessageKey },
  ],
};
const INFO: { to: string; key: MessageKey }[] = [
  { to: '/about', key: 'pub.nav.about' as MessageKey },
  { to: '/faq', key: 'pub.nav.faq' as MessageKey },
  { to: '/contact', key: 'pub.nav.contact' as MessageKey },
  { to: '/privacy', key: 'pub.privacy.title' as MessageKey },
  { to: '/terms', key: 'pub.terms.title' as MessageKey },
  { to: '/legal', key: 'pub.legal.title' as MessageKey },
];

/** Ctrl+K (or Cmd+K): jump to a page, search a medicine, switch theme. Keyboard only works end to end. */
export function CommandPalette() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { resolvedTheme, setTheme } = useSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [meds, setMeds] = useState<{ id: string; name: string; dosage: string }[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('counter:palette', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('counter:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user || user.role !== 'patient' || q.trim().length < 2) {
      setMeds([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api<{ items: { id: string; name: string; dosage: string }[] }>('/medicines/suggest', { query: { q }, signal: ctrl.signal })
        .then((r) => setMeds(r.items.slice(0, 5)))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open, user]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      setOpen(false);
      navigate(to);
    };
    const own = PAGES[user?.role ?? 'guest'] ?? PAGES.guest;
    const all: Item[] = [
      ...own.map((p) => ({ id: p.to, label: t(p.key), hint: t('cmd.page'), run: go(p.to) })),
      ...INFO.map((p) => ({ id: p.to, label: t(p.key), hint: t('cmd.info'), run: go(p.to) })),
      {
        id: 'theme',
        label: t(resolvedTheme === 'dark' ? 'nav.themeLight' : 'nav.themeDark'),
        hint: t('cmd.action'),
        run: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          setOpen(false);
        },
      },
    ];
    const needle = q.trim().toLowerCase();
    const pages = needle ? all.filter((i) => i.label.toLowerCase().includes(needle)) : all;
    const medicines = meds.map((m) => ({
      id: `m-${m.id}`,
      label: `${m.name} ${m.dosage}`,
      hint: t('cmd.medicine'),
      run: go(`/medicines/${m.id}`),
    }));
    return [...medicines, ...pages];
  }, [q, meds, user, resolvedTheme, navigate, setTheme, t]);

  if (!open) return null;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };
  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)} data-testid="palette">
      <div className="palette glass" role="dialog" aria-modal="true" aria-label={t('cmd.title')} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          placeholder={t('cmd.placeholder')}
          aria-label={t('cmd.placeholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <ul id={listId} role="listbox" className="palette-list">
          {items.length === 0 && <li className="muted small palette-none">{t('cmd.none')}</li>}
          {items.map((it, i) => (
            <li
              key={it.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={it.run}
            >
              <span>{it.label}</span>
              <span className="muted small">{it.hint}</span>
            </li>
          ))}
        </ul>
        <p className="muted small palette-foot">{t('cmd.keys')}</p>
      </div>
    </div>
  );
}
