import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatedOutlet } from './motion';
import { useI18n } from '../i18n';
import { useAuth, useChangeLanguage } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { api } from '../lib/api';
import type { Notification } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { IconBell, IconDashboard, IconHome, IconList, IconLogout, IconMap, IconMoon, IconSearch, IconSun, IconUser } from './Icons';

export function PrototypeNotice() {
  const { t } = useI18n();
  return (
    <div className="notice" role="note" data-testid="prototype-notice">
      {t('app.notice')}
    </div>
  );
}

function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return scrolled;
}

export function LanguageSwitch() {
  const { lang, t } = useI18n();
  const setLang = useChangeLanguage();
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="sr-only">{t('nav.language')}</span>
      <select
        className="input"
        style={{ minHeight: 38, width: 'auto', padding: '6px 10px', borderRadius: 999 }}
        value={lang}
        onChange={(e) => setLang(e.target.value as 'fr' | 'en')}
      >
        <option value="fr">FR</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useSettings();
  const { t } = useI18n();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? t('nav.themeLight') : t('nav.themeDark')}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function NotificationsBell() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = () =>
    api<{ items: Notification[]; unread: number }>('/notifications')
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});

  useEffect(() => {
    void load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fn);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fn);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const openItem = async (n: Notification) => {
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    setOpen(false);
    void load();
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`${t('nav.notifications')}${unread ? ` (${unread})` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="bell"
      >
        <IconBell />
        {unread > 0 && <span className="dot-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label={t('nav.notifications')}>
          <div className="row between" style={{ padding: '4px 8px 8px' }}>
            <strong>{t('nav.notifications')}</strong>
            {unread > 0 && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() =>
                  void api('/notifications/read-all', { method: 'POST' })
                    .then(load)
                    .catch(() => {})
                }
              >
                {t('nav.markAllRead')}
              </button>
            )}
          </div>
          {items.length === 0 && (
            <p className="muted small" style={{ padding: 8 }}>
              {t('nav.noNotifications')}
            </p>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif ${n.readAt ? '' : 'unread'}`}
              style={{ width: '100%', textAlign: 'left', border: 0, cursor: 'pointer', font: 'inherit' }}
              onClick={() => void openItem(n)}
            >
              <div>{n.body}</div>
              <div className="muted small">{formatDateTime(n.createdAt, locale)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  /** Step of the onboarding tour that points at this item. */
  tour?: string;
  icon: ReactNode;
}

export function Layout() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const scrolled = useScrolled();
  const navigate = useNavigate();

  const nav: NavItem[] =
    user?.role === 'patient'
      ? [
          { to: '/home', label: t('nav.home'), icon: <IconHome /> },
          { to: '/search', label: t('nav.search'), icon: <IconSearch /> },
          { to: '/map', label: t('nav.map'), icon: <IconMap />, tour: 'map' },
          { to: '/requests', label: t('nav.requests'), short: t('nav.requestsShort'), icon: <IconList />, tour: 'requests' },
          { to: '/profile', label: t('nav.profile'), icon: <IconUser /> },
        ]
      : user
        ? [
            {
              to: { doctor: '/doctor', pharmacy: '/pharmacy', staff: '/admin', patient: '/home' }[user.role],
              label: t('nav.dashboard'),
              icon: <IconDashboard />,
            },
            { to: '/profile', label: t('nav.profile'), icon: <IconUser /> },
          ]
        : [];

  return (
    <>
      <div className="app">
        <a href="#main" className="sr-only">
          {t('app.skip')}
        </a>
        <PrototypeNotice />
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <Link to="/" className="brand" aria-label={t('nav.brandHome')}>
            counter<span>.</span>
          </Link>
          <nav className="topnav" aria-label={t('nav.main')}>
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} data-tour={n.tour}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="spacer" />
          <LanguageSwitch />
          <ThemeToggle />
          {user && <NotificationsBell />}
          {user && (
            <button
              type="button"
              className="icon-btn"
              aria-label={t('nav.logout')}
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <IconLogout />
            </button>
          )}
        </header>
        <main id="main" className="main">
          <AnimatedOutlet />
        </main>
        <footer className="footer">
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/privacy">{t('footer.privacy')}</Link>
        </footer>
        {nav.length > 0 && (
          <nav className="tabbar" aria-label={t('nav.tabs')}>
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} data-tour={n.tour}>
                {n.icon}
                <span>{n.short ?? n.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
