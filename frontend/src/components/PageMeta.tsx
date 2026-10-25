import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';

/** Page title key per route (public pages and the main app screens). Unknown routes keep the default title. */
const TITLES: Record<string, MessageKey> = {
  '/': 'meta.home',
  '/how-it-works': 'pub.nav.how',
  '/patients': 'pub.nav.patients',
  '/pharmacies': 'pub.nav.pharmacies',
  '/doctors': 'pub.nav.doctors',
  '/about': 'pub.nav.about',
  '/contact': 'pub.nav.contact',
  '/faq': 'pub.nav.faq',
  '/privacy': 'pub.privacy.title',
  '/terms': 'pub.terms.title',
  '/legal': 'pub.legal.title',
  '/login': 'login.title',
  '/register': 'register.title',
  '/home': 'nav.home',
  '/search': 'nav.search',
  '/map': 'nav.map',
  '/requests': 'nav.requests',
  '/profile': 'nav.profile',
  '/pharmacy': 'nav.dashboard',
  '/doctor': 'nav.dashboard',
  '/admin': 'nav.dashboard',
};

/** Sets the browser tab title and the page description for the current route and language. */
export function PageMeta() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => {
    const key = TITLES[pathname.replace(/\/$/, '') || '/'];
    document.title = key ? `${t(key)} · counter.` : t('meta.default');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  }, [pathname, t]);
  return null;
}
