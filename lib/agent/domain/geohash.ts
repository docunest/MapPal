// Geohash (base32) — the tile id for Phase 0. Precision 5 ≈ 4.9 × 4.9 km.
import type { LatLng } from "@/lib/geo";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohash({ lat, lng }: LatLng, precision = 5): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let out = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (out.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch <<= 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) {
      out += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return out;
}

/** Geohash cells touched by a circle (sampled on a grid finer than a cell). */
export function tilesForCircle(c: LatLng & { radiusM: number }, precision = 5): string[] {
  const out = new Set<string>();
  const stepM = 1500;
  const n = Math.ceil(c.radiusM / stepM);
  const dLat = stepM / 111_320;
  const dLng = stepM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      if ((i * stepM) ** 2 + (j * stepM) ** 2 > (c.radiusM + stepM) ** 2) continue;
      out.add(geohash({ lat: c.lat + i * dLat, lng: c.lng + j * dLng }, precision));
    }
  }
  out.add(geohash(c, precision));
  return [...out].sort();
}
