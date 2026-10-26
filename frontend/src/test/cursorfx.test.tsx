import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CursorFx } from '../components/CursorFx';
import { FxHeadline } from '../components/FxText';
import { COMPOSITIONS } from '../three/compositions';

const state = vi.hoisted(() => ({ reduced: false, tier: 'medium' }));
vi.mock('../lib/settings', () => ({ useReducedMotion: () => state.reduced }));
vi.mock('../lib/graphics', () => ({ useGraphics: () => ({ tier: state.tier }) }));

const mount = () =>
  render(
    <MemoryRouter>
      <CursorFx />
    </MemoryRouter>,
  );

describe('cursor effects', () => {
  beforeEach(() => {
    state.reduced = false;
    state.tier = 'medium';
  });

  it('draws the glow and three trail dots on a normal setup', () => {
    mount();
    const layer = screen.getByTestId('cursor-fx');
    expect(layer.querySelectorAll('.fx-glow')).toHaveLength(1);
    expect(layer.querySelectorAll('.fx-dot')).toHaveLength(3);
  });

  it.each(['low', 'off'])('is off on the %s graphics tier', (tier) => {
    state.tier = tier;
    mount();
    expect(screen.queryByTestId('cursor-fx')).toBeNull();
  });

  it('is off with reduced motion', () => {
    state.reduced = true;
    mount();
    expect(screen.queryByTestId('cursor-fx')).toBeNull();
  });
});

describe('headline letters', () => {
  it('keeps the plain text as the accessible name and hides the split letters', () => {
    render(<FxHeadline text="Votre pharmacie" />);
    const h = screen.getByRole('heading', { name: 'Votre pharmacie' });
    expect(h.querySelectorAll('.fx-l')).toHaveLength('Votrepharmacie'.length);
    expect(h.querySelectorAll('.fx-w[aria-hidden="true"]')).toHaveLength(2);
  });
});

describe('3D objects on the login, sign-up and recovery pages', () => {
  it.each(['auth', 'register', 'recover'] as const)('%s: wide layout keeps objects below the text band or at the far sides, phone layout sits above the headline', (name) => {
    const c = COMPOSITIONS[name];
    // wide screens: the text fills the left column down to about y = -1.1 (world units), so objects there sit lower or at the right margin
    for (const it of c.items) expect(it.pos[1] <= -2 || it.pos[0] >= 5, `${name} ${it.kind} at ${it.pos}`).toBe(true);
    // phones and tablets: placed by screen position in the gap between the top bar and the headline (px from the top)
    expect(c.portrait?.length, name).toBeGreaterThanOrEqual(3);
    for (const it of c.portrait ?? []) {
      expect(it.screen, `${name} ${it.kind}`).toBe(true);
      expect(it.pos[2]).toBeLessThanOrEqual(1);
      expect(it.pos[1], `${name} ${it.kind}`).toBeGreaterThanOrEqual(190);
      expect(it.pos[1], `${name} ${it.kind}`).toBeLessThanOrEqual(270);
    }
  });
});
