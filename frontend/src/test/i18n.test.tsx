import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import fr from '../i18n/locales/fr.json';
import en from '../i18n/locales/en.json';
import { I18nProvider, useI18n } from '../i18n';

const SRC = path.resolve(__dirname, '..');
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'test' ? [] : tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** Words that are the same in every language: brand, language names, codes, map attribution. */
const ALLOWED = new Set([
  'FR',
  'EN',
  'Français',
  'English',
  'counter',
  'Rx',
  'MapTiler',
  'OpenStreetMap contributors',
  'CIP13',
  'RPPS',
  'API',
  'CSV',
]);

describe('translations', () => {
  it('fr.json and en.json have exactly the same keys', () => {
    const onlyFr = Object.keys(fr).filter((k) => !(k in en));
    const onlyEn = Object.keys(en).filter((k) => !(k in fr));
    expect(onlyFr, 'keys missing in en.json').toEqual([]);
    expect(onlyEn, 'keys missing in fr.json').toEqual([]);
  });

  it('every key has text and the same {placeholders} in both languages', () => {
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(String(fr[k]).trim(), k).not.toBe('');
      expect(String(en[k]).trim(), k).not.toBe('');
      expect(vars(en[k]), k).toEqual(vars(fr[k]));
    }
  });

  it('no hard-coded text in components: visible text and labels go through t()', () => {
    const found: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Text between JSX tags.
      for (const m of src.matchAll(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*)?>([^<>{}]+)</g)) {
        const text = m[1].trim();
        if (
          !text ||
          !/[A-Za-zÀ-ÿ]{2,}/.test(text) ||
          /^(void|await|return|typeof)\b/.test(text) ||
          /[(){};=[\]`]|=>/.test(text) ||
          ALLOWED.has(text)
        )
          continue;
        found.push(`${path.relative(SRC, file)}: "${text}"`);
      }
      // Accessible names and hints written as plain strings.
      for (const m of src.matchAll(/\b(aria-label|title|placeholder|alt|label)="([^"]*[A-Za-zÀ-ÿ]{2,}[^"]*)"/g)) {
        if (!ALLOWED.has(m[2])) found.push(`${path.relative(SRC, file)}: ${m[1]}="${m[2]}"`);
      }
    }
    expect(found).toEqual([]);
  });

  it('switching the language re-renders the text and updates <html lang>', () => {
    function Probe() {
      const { t, setLang } = useI18n();
      return (
        <>
          <p>{t('nav.home')}</p>
          <button onClick={() => setLang('en')}>{t('nav.language')}</button>
        </>
      );
    }
    render(
      <I18nProvider lang="fr">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Accueil')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    act(() => screen.getByRole('button').click());
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('counter.lang')).toBe('en');
  });
});
