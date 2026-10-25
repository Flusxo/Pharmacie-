/**
 * Layout of the public website (before login): prototype notice, top bar with a big "Log in" button
 * and a secondary "Create account", page content, footer with fictional contact details.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { homeFor, useAuth } from '../../lib/auth';
import { AnimatedOutlet } from '../motion';
import { LanguageSwitch, PrototypeNotice, ThemeToggle } from '../Layout';
import { IconClose, IconLogin, IconMail, IconMenu, IconPhone, IconPin } from '../Icons';
import type { MessageKey } from '../../i18n';

export const PUBLIC_NAV: { to: string; key: MessageKey }[] = [
  { to: '/how-it-works', key: 'pub.nav.how' },
  { to: '/patients', key: 'pub.nav.patients' },
  { to: '/pharmacies', key: 'pub.nav.pharmacies' },
  { to: '/doctors', key: 'pub.nav.doctors' },
  { to: '/about', key: 'pub.nav.about' },
  { to: '/faq', key: 'pub.nav.faq' },
  { to: '/contact', key: 'pub.nav.contact' },
];

function AccountButtons({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  if (user) {
    return (
      <Link to={homeFor(user)} className="btn login-btn" data-testid="my-space">
        {t('pub.mySpace')}
      </Link>
    );
  }
  return (
    <>
      {!compact && (
        <Link to="/register" className="btn secondary register-btn">
          {t('pub.register')}
        </Link>
      )}
      <Link to="/login" className="btn login-btn" data-testid="login-button">
        <IconLogin width={20} height={20} />
        <span>{t('pub.login')}</span>
      </Link>
    </>
  );
}

export function PublicHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <header className={`topbar pub-topbar ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="brand" aria-label={t('nav.brandHome')}>
        counter<span>.</span>
      </Link>
      <nav className="pub-nav" aria-label={t('pub.nav.label')}>
        {PUBLIC_NAV.map((n) => (
          <NavLink key={n.to} to={n.to}>
            {t(n.key)}
          </NavLink>
        ))}
      </nav>
      <div className="spacer" />
      <div className="pub-tools">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
      <div className="pub-actions">
        <AccountButtons />
      </div>
      <button
        type="button"
        className="icon-btn pub-menu-btn"
        aria-expanded={open}
        aria-controls="pub-menu"
        aria-label={open ? t('pub.nav.closeMenu') : t('pub.nav.menu')}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <IconClose /> : <IconMenu />}
      </button>
      {open && (
        <div id="pub-menu" className="pub-menu" role="dialog" aria-modal="false" aria-label={t('pub.nav.label')}>
          <nav className="stack" aria-label={t('pub.nav.label')}>
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <div className="row pub-menu-tools">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <AccountButtons />
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  const col = (title: MessageKey, links: { to: string; key: MessageKey }[]) => (
    <div className="stack" style={{ gap: 8 }}>
      <strong>{t(title)}</strong>
      {links.map((l) => (
        <Link key={l.to} to={l.to}>
          {t(l.key)}
        </Link>
      ))}
    </div>
  );
  return (
    <footer className="pub-footer">
      <div className="pub-footer-grid">
        <div className="stack" style={{ gap: 10 }}>
          <Link to="/" className="brand" aria-label={t('nav.brandHome')}>
            counter<span>.</span>
          </Link>
          <p className="muted small">{t('pub.footer.tagline')}</p>
          <p className="small">
            <strong>{t('pub.footer.notShop')}</strong>
          </p>
        </div>
        {col('pub.footer.service', PUBLIC_NAV.slice(0, 4))}
        {col('pub.footer.info', [
          ...PUBLIC_NAV.slice(4),
          { to: '/privacy', key: 'pub.privacy.title' },
          { to: '/terms', key: 'pub.terms.title' },
          { to: '/legal', key: 'pub.legal.title' },
        ])}
        <div className="stack small" style={{ gap: 8 }} data-testid="footer-contact">
          <strong>{t('pub.footer.contactTitle')}</strong>
          <span className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <IconPin width={18} height={18} style={{ flex: 'none', marginTop: 2 }} />
            {t('pub.footer.address')}
          </span>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <IconPhone width={18} height={18} style={{ flex: 'none' }} />
            {t('pub.footer.phone')}
          </span>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <IconMail width={18} height={18} style={{ flex: 'none' }} />
            {t('pub.footer.email')}
          </span>
          <span className="muted">{t('pub.footer.hours')}</span>
        </div>
      </div>
      <div className="pub-footer-bottom small muted">
        <span>{t('pub.footer.rights')}</span>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  const { t } = useI18n();
  return (
    <div className="app pub-app">
      <a href="#main" className="sr-only">
        {t('app.skip')}
      </a>
      <PrototypeNotice />
      <PublicHeader />
      <main id="main" className="pub-main">
        <AnimatedOutlet />
      </main>
      <PublicFooter />
    </div>
  );
}
