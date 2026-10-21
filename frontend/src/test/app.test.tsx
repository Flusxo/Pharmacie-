import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fr } from '../i18n/fr';
import { en } from '../i18n/en';
import { I18nProvider, translate } from '../i18n';
import { formatDate, formatPrice, openState } from '../lib/format';
import { PackImage } from '../components/PackImage';
import { LoginPage } from '../pages/Login';
import { AuthProvider } from '../lib/auth';
import { stepIndex } from '../pages/patient/OrderTracking';

const SRC = path.resolve(__dirname, '..');
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'test' ? [] : sourceFiles(p);
    return /\.(tsx?|css)$/.test(d.name) ? [p] : [];
  });
}

describe('hard rules in the source', () => {
  it('never uses buy / cart wording', () => {
    const all =
      sourceFiles(SRC)
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n') +
      Object.values(fr).join('\n') +
      Object.values(en).join('\n');
    expect(all).not.toMatch(/buy now|add to cart|acheter|ajouter au panier|\bpanier\b/i);
  });

  it('never hard-codes the API host (always the relative /api path)', () => {
    for (const f of sourceFiles(SRC)) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/localhost:4000|127\.0\.0\.1:4000/);
  });

  it('keeps the permanent prototype notice in both languages', () => {
    expect(fr['app.notice']).toBe('Prototype uniquement. Pas pour un usage médical réel. Données de démonstration.');
    expect(en['app.notice']).toBe('Prototype only. Not for real medical use. Demo data.');
  });

  it('has no "TODO: implement" or "..." placeholders in UI code', () => {
    for (const f of sourceFiles(SRC)) {
      const s = fs.readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/TODO: implement|>\s*\.\.\.\s*</);
    }
  });
});

describe('i18n', () => {
  it('French and English have the same keys and the same {placeholders}', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) {
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(vars(en[k]), k).toEqual(vars(fr[k]));
      expect(en[k].trim(), k).not.toBe('');
    }
  });
  it('fills variables', () => {
    expect(translate('fr', 'home.greeting', { name: 'Alice' })).toBe('Bonjour Alice');
    expect(translate('en', 'home.greeting', { name: 'Alice' })).toBe('Hello Alice');
  });
});

describe('French formats', () => {
  it('prices as "4,50 €" and dates as DD/MM/YYYY in Europe/Paris', () => {
    expect(formatPrice(4.5, 'fr-FR').replace(/\s/g, ' ')).toBe('4,50 €');
    expect(formatDate('2026-03-05T23:30:00Z', 'fr-FR')).toBe('06/03/2026'); // already the 6th in Paris
  });
  it('computes open / closed / on duty in Europe/Paris', () => {
    const hours = {
      wed: [
        ['08:30', '12:30'],
        ['14:00', '19:30'],
      ] as [string, string][],
    };
    // Wednesday 21 Oct 2026, 10:00 Paris (08:00 UTC)
    expect(openState(hours, [], new Date('2026-10-21T08:00:00Z'))).toEqual({ kind: 'open', closesAt: '12:30' });
    expect(openState(hours, [], new Date('2026-10-21T11:00:00Z'))).toEqual({ kind: 'closed', opensAt: '14:00' });
    expect(openState(hours, [], new Date('2026-10-21T19:00:00Z'))).toEqual({ kind: 'closed', opensAt: null });
    expect(openState(hours, ['wed'], new Date('2026-10-21T21:00:00Z')).kind).toBe('duty'); // 23:00 Wednesday in Paris
  });
});

describe('PackImage', () => {
  it('prints name and dosage, with an accessible label', () => {
    render(<PackImage name="Doliprane 1000 mg" dosage="1000 mg" form="tablet" category="pain" />);
    const img = screen.getByRole('img', { name: 'Doliprane 1000 mg — 1000 mg' });
    expect(img.textContent).toContain('Doliprane');
    expect(img.textContent).toContain('1000 mg');
  });
  it('falls back to the generated pack when the real image fails', () => {
    render(<PackImage name="Testamol" dosage="500 mg" form="syrup" category="cold" imageUrl="https://example.test/x.png" />);
    const real = screen.getByRole('img', { name: 'Testamol — 500 mg' });
    expect(real.tagName).toBe('IMG');
    fireEvent.error(real);
    expect(screen.getByRole('img', { name: 'Testamol — 500 mg' }).tagName.toLowerCase()).toBe('svg');
  });
});

describe('login page', () => {
  it('shows role tabs, the staff link and the dev-only demo panel', () => {
    render(
      <I18nProvider lang="fr">
        <AuthProvider>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    );
    expect(screen.getByRole('tab', { name: 'Patient' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Médecin' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pharmacie' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connexion équipe' })).toHaveAttribute('href', '/login/staff');
    expect(screen.getByTestId('demo-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alice — Tournon' }));
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('alice@pharmacie.test');
  });
});

describe('order stepper', () => {
  it('maps statuses to the 6 steps', () => {
    expect(stepIndex('accepted')).toBe(1);
    expect(stepIndex('delivered')).toBe(5);
    expect(stepIndex('cancelled')).toBe(-1);
  });
});
