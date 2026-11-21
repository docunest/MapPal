// Geohash cell → its bounding box, for drawing indexed tiles on the map.
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohashBox(hash: string): { s: number; w: number; n: number; e: number } {
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
