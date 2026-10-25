import { describe, expect, it } from 'vitest';
import { clusterPins, type MapPharmacy } from '../components/map/PharmacyMap';

const ph = (id: string, x: number): MapPharmacy => ({ id, name: id, address: '', latitude: 0, longitude: x });

describe('map pin clustering', () => {
  const project = (_lat: number, lon: number): [number, number] => [lon, 0];
  it('merges pins closer than the distance on screen and keeps far ones alone', () => {
    const out = clusterPins([ph('a', 0), ph('b', 10), ph('c', 20), ph('d', 500)], project, 44);
    expect(out.map((c) => c.items.map((p) => p.id))).toEqual([['a', 'b', 'c'], ['d']]);
    expect(out[0].lon).toBeCloseTo(10);
  });
  it('gives every pin back exactly once', () => {
    const items = Array.from({ length: 30 }, (_, i) => ph(`p${i}`, i * 17));
    const ids = clusterPins(items, project).flatMap((c) => c.items.map((p) => p.id));
    expect(ids.sort()).toEqual(items.map((p) => p.id).sort());
  });
});
