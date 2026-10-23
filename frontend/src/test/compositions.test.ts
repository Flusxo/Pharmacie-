import { describe, expect, it } from 'vitest';
import { MEDICINES } from '../../../db/src/data';
import { COMPOSITIONS, compositionFor, type CompositionName } from '../three/compositions';
import { hasCap, hasExploded, productKindFor } from '../three/models';

describe('3D: a scene on every page', () => {
  const pages: [string, CompositionName][] = [
    ['/', 'home'],
    ['/how-it-works', 'how'],
    ['/patients', 'patients'],
    ['/pharmacies', 'pharmacies'],
    ['/doctors', 'doctors'],
    ['/about', 'about'],
    ['/contact', 'contact'],
    ['/faq', 'faq'],
    ['/privacy', 'privacy'],
    ['/terms', 'terms'],
    ['/login', 'auth'],
    ['/register', 'register'],
    ['/forgot-password', 'recover'],
    ['/reset-password', 'recover'],
    ['/home', 'app-home'],
    ['/search', 'app-search'],
    ['/medicines/123', 'app-details'],
    ['/map', 'app-map'],
    ['/requests', 'app-requests'],
    ['/requests/abc', 'app-requests'],
    ['/orders/abc', 'app-tracking'],
    ['/track/xyz', 'app-tracking'],
    ['/profile', 'app-account'],
    ['/pharmacy', 'app-pharmacy'],
    ['/doctor', 'app-doctor'],
    ['/admin', 'app-admin'],
  ];

  it.each(pages)('%s shows the %s composition', (path, name) => {
    expect(compositionFor(path)).toBe(name);
  });

  it('every composition exists, has objects, and no two pages share the same scene', () => {
    const seen = new Map<string, string>();
    for (const [, name] of pages) {
      const c = COMPOSITIONS[name];
      expect(c, name).toBeDefined();
      expect(c.items.length, name).toBeGreaterThanOrEqual(3);
      const key = JSON.stringify(c.items);
      const same = seen.get(key);
      expect(same === undefined || same === name, `${name} has the same scene as ${same}`).toBe(true);
      seen.set(key, name);
    }
  });

  it('the set pieces are used: pharmacy interior, lit cross, dust in light beams, delivery route with scooter', () => {
    const kinds = new Set(Object.values(COMPOSITIONS).flatMap((c) => c.items.map((i) => i.kind)));
    for (const k of ['interior', 'cross', 'beams', 'route', 'shelf', 'capsule', 'tablet']) expect(kinds.has(k as never), k).toBe(true);
  });
});

describe('3D: a model for every medicine form', () => {
  it('every form in the demo data has a dedicated model, and the new ones are used', () => {
    const forms = [...new Set(MEDICINES.map((m) => m.form))];
    for (const f of forms.filter((x) => x !== 'capsule')) expect(productKindFor(f), f).not.toBe('pillbottle');
    expect(productKindFor('capsule')).toBe('pillbottle');
    expect(productKindFor('tablet')).toBe('carton');
    expect(productKindFor('spray')).toBe('spray');
    expect(productKindFor('drops')).toBe('dropper');
    expect(productKindFor('something-new')).toBe('pillbottle');
  });

  it('caps unscrew on bottles and sprays, blisters and cartons explode', () => {
    for (const f of ['syrup', 'drops', 'spray', 'cream']) expect(hasCap(f), f).toBe(true);
    for (const f of ['tablet', 'lozenge']) expect(hasExploded(f), f).toBe(true);
  });
});
