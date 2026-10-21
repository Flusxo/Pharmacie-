import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { SettingsProvider } from '../lib/settings';
import PharmacyMap, { MAP_ATTRIBUTION } from '../components/map/PharmacyMap';

const pharmacies = [
  { id: 'a', name: 'Pharmacie du Rhône', address: '12 Quai Farconnet', latitude: 45.0672, longitude: 4.8329, inStock: true, quantity: 12 },
  { id: 'b', name: 'Pharmacie de l’Étoile', address: '1 Place', latitude: 44.8389, longitude: 4.8925, inStock: false, quantity: 0 },
];

function renderMap(tileUrl: string) {
  return render(
    <SettingsProvider>
      <I18nProvider lang="en">
        <PharmacyMap center={{ lat: 45.06, lon: 4.83 }} radiusKm={30} pharmacies={pharmacies} stockMode tileUrl={tileUrl} />
      </I18nProvider>
    </SettingsProvider>,
  );
}

describe('PharmacyMap (section 10)', () => {
  it('without VITE_MAP_TILE_URL: shows the exact message, a Retry button, attribution, and still renders pins', () => {
    const { container } = renderMap('');
    expect(screen.getByTestId('map-fallback')).toHaveTextContent(
      'Map tiles are not configured. Set VITE_MAP_TILE_URL in .env. Pins still work.',
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(container.querySelector('.leaflet-tile')).toBeNull();
    expect(container.querySelector('.leaflet-control-attribution')?.textContent).toBe('© MapTiler © OpenStreetMap contributors');
    expect(container.querySelectorAll('.pin-ok')).toHaveLength(1);
    expect(container.querySelectorAll('.pin-off')).toHaveLength(1);
    expect(container.querySelector('[title="Pharmacie du Rhône — In stock"]')).not.toBeNull();
  });

  it('with a tile URL: no fallback message before any tile failed', () => {
    renderMap('https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=test');
    expect(screen.queryByTestId('map-fallback')).toBeNull();
  });

  it('never points at OpenStreetMap or CARTO tile servers', () => {
    expect(MAP_ATTRIBUTION).toContain('maptiler.com/copyright');
    // The only tile URL comes from the prop / VITE_MAP_TILE_URL; nothing else is hard-coded.
    expect(PharmacyMap.toString()).not.toMatch(/tile\.openstreetmap|basemaps\.cartocdn/);
  });
});
