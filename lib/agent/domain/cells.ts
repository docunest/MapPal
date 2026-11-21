// The place index's cells: geohash-4 (≈ 39 × 20 km at the equator, ≈ 30 × 20
// km in Iberia). Pure.
import { distanceMeters, type LatLng } from "@/lib/geo";
import { geohash } from "./geohash";

export const CELL_PRECISION = 4;
export const CELL_FRESH_DAYS = 30;

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function cellBox(hash: string): { s: number; w: number; n: number; e: number } {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let even = true;
  for (const ch of hash) {
    const v = BASE32.indexOf(ch);
    for (let bit = 4; bit >= 0; bit--) {
      const on = (v >> bit) & 1;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (on) lngMin = mid; else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid; else latMax = mid;
      }
      even = !even;
    }
  }
  return { s: latMin, w: lngMin, n: latMax, e: lngMax };
}

export const cellOf = (p: LatLng) => geohash(p, CELL_PRECISION);

/** Cells whose box touches a circle, nearest first. */
export function cellsForCircle(c: LatLng & { radiusM: number }): string[] {
  const out = new Map<string, number>();
  const stepM = 5000;
  const n = Math.ceil(c.radiusM / stepM) + 1;
  const dLat = stepM / 111_320;
  const dLng = stepM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const p = { lat: c.lat + i * dLat, lng: c.lng + j * dLng };
      const d = distanceMeters(c, p);
      if (d > c.radiusM + stepM) continue;
      const h = cellOf(p);
      out.set(h, Math.min(out.get(h) ?? Infinity, d));
    }
  }
  const self = cellOf(c);
  out.set(self, 0);
  return [...out].sort((a, b) => a[1] - b[1]).map(([h]) => h);
}

/** A cell's box split in four (for a cell too big for one Overpass answer). */
export function quarters(b: { s: number; w: number; n: number; e: number }) {
  const mLat = (b.s + b.n) / 2;
  const mLng = (b.w + b.e) / 2;
  return [
    { s: b.s, w: b.w, n: mLat, e: mLng },
    { s: b.s, w: mLng, n: mLat, e: b.e },
    { s: mLat, w: b.w, n: b.n, e: mLng },
    { s: mLat, w: mLng, n: b.n, e: b.e },
  ];
}

/** Which index layer an OSM element belongs to (null = not kept). */
export function layerOf(t: Record<string, string>): "food" | "explore" | "parking" | "stay" | "town" | null {
  if (t.amenity && /^(cafe|bar|pub|restaurant|ice_cream|fast_food|biergarten)$/.test(t.amenity)) return "food";
  if (t.amenity === "parking") return "parking";
  if (t.tourism === "camp_site" || t.tourism === "caravan_site") return "stay";
  if (t.place && /^(city|town|village|hamlet)$/.test(t.place)) return "town";
  return "explore";
}
