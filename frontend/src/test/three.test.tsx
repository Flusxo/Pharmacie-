import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { I18nProvider } from '../i18n';
import { SettingsProvider } from '../lib/settings';
import { GraphicsProvider, ceilingTier, chooseTier, frameloopFor, type DeviceInfo } from '../lib/graphics';
import { ProductVisual, RootStage } from '../components/three/ThreeVisuals';

// The real scenes need WebGL; in tests they are replaced by markers that expose the props they receive.
vi.mock('../three/ProductScene', () => ({
  default: (p: { reduced: boolean; onReady?: () => void }) => {
    p.onReady?.();
    return <div data-testid="product-scene" data-reduced={String(p.reduced)} />;
  },
}));
vi.mock('../three/PageScene', () => ({
  default: (p: { name: string; paused: boolean; onReady?: () => void }) => {
    p.onReady?.();
    return <div data-testid="bg-scene" data-name={p.name} data-paused={String(p.paused)} />;
  },
}));

const strong: DeviceInfo = { webgl: true, webgl2: true, memoryGb: 16, cores: 12, mobile: false };
const noGl: DeviceInfo = { webgl: false, webgl2: false, memoryGb: 16, cores: 12, mobile: false };

function wrap(children: ReactNode, device: DeviceInfo) {
  return (
    <SettingsProvider>
      <GraphicsProvider device={device}>
        <I18nProvider lang="fr">
          <MemoryRouter>{children}</MemoryRouter>
        </I18nProvider>
      </GraphicsProvider>
    </SettingsProvider>
  );
}
const med = { name: 'Hélicidine sirop', dosage: '10 %', form: 'syrup', category: 'cold', cip13: '3400930001234', imageUrl: null };

describe('graphics tiers', () => {
  it('chooses Off without WebGL, Low with little memory, Medium on mobile, High on a strong desktop', () => {
    expect(chooseTier('auto', noGl)).toBe('off');
    expect(chooseTier('auto', { ...strong, memoryGb: 2 })).toBe('low');
    expect(chooseTier('auto', { ...strong, mobile: true })).toBe('medium');
    expect(chooseTier('auto', strong)).toBe('medium'); // every device starts safe
    expect(ceilingTier(strong)).toBe('high');
    expect(ceilingTier({ ...strong, integratedGpu: true })).toBe('medium');
    expect(ceilingTier({ ...strong, mobile: true })).toBe('medium');
    expect(chooseTier('high', { ...strong, mobile: true })).toBe('high'); // explicit choice respected
    expect(chooseTier('ultra', strong)).toBe('high'); // High (4K) is the High tier with the resolution unlocked
    expect(chooseTier('off', strong)).toBe('off');
    expect(chooseTier('high', noGl)).toBe('off'); // never without WebGL
    expect(chooseTier('auto', { ...strong, softwareGl: true })).toBe('low'); // no real GPU
  });

  it('renders one still frame with reduced motion and nothing off-screen', () => {
    expect(frameloopFor({ visible: true, paused: false, reduced: true })).toBe('demand');
    expect(frameloopFor({ visible: true, paused: false, reduced: false })).toBe('always');
    expect(frameloopFor({ visible: false, paused: false, reduced: false })).toBe('never');
    expect(frameloopFor({ visible: true, paused: true, reduced: false })).toBe('never');
  });
});

describe('3D fallbacks', () => {
  it('without WebGL the product viewer shows the 2D pack image, no 3D toggle, no error', () => {
    render(wrap(<ProductVisual {...med} />, noGl));
    expect(screen.getByTestId('product-visual')).toHaveAttribute('data-mode', 'photo');
    expect(screen.getAllByRole('img', { name: 'Hélicidine sirop — 10 %' })[0]).toBeInTheDocument();
    expect(screen.queryByTestId('toggle-3d')).toBeNull();
    expect(screen.queryByTestId('product-scene')).toBeNull();
    expect(screen.getByText('Illustration de l’emballage de Hélicidine sirop, 10 %.')).toBeInTheDocument();
  });

  it('without WebGL the root stage stays static (no canvas, no scene)', () => {
    render(wrap(<RootStage />, noGl));
    expect(screen.getByTestId('root-stage')).toHaveAttribute('data-mode', 'static');
    expect(screen.queryByTestId('bg-scene')).toBeNull();
  });

  it('with WebGL the root stage shows the composition of the route and marks the page as 3D', async () => {
    render(wrap(<RootStage />, strong));
    expect(await screen.findByTestId('bg-scene')).toHaveAttribute('data-name', 'home');
    await waitFor(() => expect(document.documentElement.dataset.stage).toBe('3d'));
  });

  it('on a phone, a page viewer pauses the root stage instead of destroying it', async () => {
    const phone = { ...strong, mobile: true };
    const { rerender } = render(wrap(<RootStage />, phone));
    const scene = await screen.findByTestId('bg-scene');
    expect(scene).toHaveAttribute('data-paused', 'false');
    rerender(
      wrap(
        <>
          <RootStage />
          <ProductVisual {...med} />
        </>,
        phone,
      ),
    );
    await screen.findByTestId('product-scene');
    expect(screen.getByTestId('bg-scene')).toBe(scene);
    expect(screen.getByTestId('bg-scene')).toHaveAttribute('data-paused', 'true');
  });

  it('with WebGL the 3D viewer loads lazily, with the 3D / Photo toggle', async () => {
    render(wrap(<ProductVisual {...med} />, strong));
    expect(await screen.findByTestId('product-scene')).toHaveAttribute('data-reduced', 'false');
    expect(screen.getByTestId('toggle-3d')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-photo')).toBeInTheDocument();
  });

  it('with reduced motion the scene gets the still-frame mode and the 360° hint is hidden', async () => {
    localStorage.setItem('counter.reduceMotion', 'true');
    render(wrap(<ProductVisual {...med} />, strong));
    expect(await screen.findByTestId('product-scene')).toHaveAttribute('data-reduced', 'true');
    await waitFor(() => expect(screen.getByTestId('product-visual')).toHaveClass('ready'));
    expect(screen.queryByText('360°')).toBeNull();
    localStorage.removeItem('counter.reduceMotion');
  });

  it('Graphics quality "Off" disables 3D even with WebGL', () => {
    localStorage.setItem('counter.graphics', 'off');
    render(wrap(<ProductVisual {...med} />, strong));
    expect(screen.getByTestId('product-visual')).toHaveAttribute('data-mode', 'photo');
    localStorage.removeItem('counter.graphics');
  });
});
