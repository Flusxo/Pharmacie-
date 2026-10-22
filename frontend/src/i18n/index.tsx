/**
 * Translations with i18next / react-i18next. All UI text lives in `locales/fr.json` and `locales/en.json`
 * (flat keys, `{name}` placeholders). French is the default. The chosen language is remembered in the
 * browser and, when logged in, on the account (see `useLanguagePreference` in `lib/auth.tsx`).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import frJson from './locales/fr.json';
import enJson from './locales/en.json';
import { setApiLanguage } from '../lib/api';
import { setLabelFooter } from '../three/labelFooter';

export type Lang = 'fr' | 'en';
export type MessageKey = keyof typeof frJson;
export const LANGS: Lang[] = ['fr', 'en'];
const STORAGE_KEY = 'counter.lang';
export const localeFor = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

function createI18n(lang: Lang): I18nInstance {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { fr: { translation: frJson }, en: { translation: enJson } },
    lng: lang,
    fallbackLng: 'fr',
    supportedLngs: LANGS,
    // Flat keys such as "home.greeting": dots are part of the key, not nesting.
    keySeparator: false,
    nsSeparator: false,
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
  return instance;
}

/** Plain translation outside React (tests, non-component code). */
const standalone: Partial<Record<Lang, I18nInstance>> = {};
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  standalone[lang] ??= createI18n(lang);
  return standalone[lang]!.t(key, vars);
}

export function savedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    // Storage unavailable (private mode).
  }
  return null;
}

export function I18nProvider({ children, lang: forced }: { children: ReactNode; lang?: Lang }) {
  // French unless the user chose English before (this browser) or on their account.
  const [instance] = useState(() => createI18n(forced ?? savedLang() ?? 'fr'));
  useEffect(() => {
    const apply = (l: string) => {
      document.documentElement.lang = l;
      setApiLanguage(l === 'en' ? 'en' : 'fr');
      setLabelFooter(instance.t('three.demoMark'));
    };
    apply(instance.language);
    instance.on('languageChanged', apply);
    return () => instance.off('languageChanged', apply);
  }, [instance]);
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunction;
  locale: string;
}

/** A stored speciality ("Pédiatrie") in the UI language; unknown values are shown as typed. */
export function specialityLabel(value: string, t: TFunction): string {
  const key = `speciality.${value}` as MessageKey;
  const out = t(key);
  return out === key ? value : out;
}

export function useI18n(): I18n {
  const { t, i18n } = useTranslation();
  const lang = (LANGS.includes(i18n.language as Lang) ? i18n.language : 'fr') as Lang;
  const setLang = useCallback(
    (l: Lang) => {
      void i18n.changeLanguage(l);
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        // Not remembered in this browser; harmless.
      }
    },
    [i18n],
  );
  return useMemo(() => ({ lang, setLang, t: ((k, v) => t(k, v)) as TFunction, locale: localeFor(lang) }), [lang, setLang, t]);
}
