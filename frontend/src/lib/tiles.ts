/**
 * Reads VITE_MAP_TILE_URL (the ONLY source of map tiles; no default tile server).
 * Accepts either a full raster tile URL with {z}/{x}/{y}, or a bare MapTiler key, which is expanded
 * to the MapTiler "streets-v2" raster URL. Common mistakes are reported instead of failing silently.
 */
export type TileProblem = 'empty' | 'subdomains' | 'style' | 'invalid';
export interface TileConfig {
  url: string;
  problem: TileProblem | null;
  fromKey: boolean;
}

const MAPTILER_RASTER = 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=';

export function resolveTileUrl(raw: string | undefined | null): TileConfig {
  const v = (raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (!v) return { url: '', problem: 'empty', fromKey: false };
  if (/^[A-Za-z0-9_-]{16,64}$/.test(v)) return { url: MAPTILER_RASTER + v, problem: null, fromKey: true };
  if (/style\.json/i.test(v)) return { url: '', problem: 'style', fromKey: false };
  if (v.includes('{s}')) return { url: '', problem: 'subdomains', fromKey: false };
  if (!/^https:\/\//.test(v) || !/\{z\}/.test(v) || !/\{x\}/.test(v) || !/\{y\}/.test(v))
    return { url: '', problem: 'invalid', fromKey: false };
  return { url: v, problem: null, fromKey: false };
}
