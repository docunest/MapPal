// Small, dependency-free geo helpers shared by the live (around-me) features.
// Coordinates are always plain numbers in degrees; distances in meters.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, 0-360 (0 = north, 90 = east). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compassLabel(bearing: number): string {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/** Signed difference target - heading, normalized to -180..180. */
export function angleDelta(heading: number, target: number): number {
  return ((((target - heading) % 360) + 540) % 360) - 180;
}

export type RelativeDirection = "ahead" | "left" | "right" | "behind";

export function relativeDirection(heading: number, bearing: number): RelativeDirection {
  const d = angleDelta(heading, bearing);
  if (Math.abs(d) <= 40) return "ahead";
  if (Math.abs(d) >= 130) return "behind";
  return d < 0 ? "left" : "right";
}

export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 9500) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

/**
 * Distance from point p to the polyline, plus the index of the nearest
 * segment and the distance along the line to the nearest point. Uses a local
 * equirectangular projection, which is accurate enough at the few-km scale
 * the access check and route corridor work at.
 */
export function nearestOnPolyline(
  p: LatLng,
  line: LatLng[],
): { distance: number; segmentIndex: number; alongMeters: number; point: LatLng } {
  if (line.length === 0) return { distance: Infinity, segmentIndex: -1, alongMeters: 0, point: p };
  if (line.length === 1) {
    return { distance: distanceMeters(p, line[0]), segmentIndex: 0, alongMeters: 0, point: line[0] };
  }

  const kx = Math.cos(toRad(p.lat)) * ((Math.PI * EARTH_RADIUS_M) / 180);
  const ky = (Math.PI * EARTH_RADIUS_M) / 180;
  const project = (q: LatLng) => ({ x: (q.lng - p.lng) * kx, y: (q.lat - p.lat) * ky });

  let best = { distance: Infinity, segmentIndex: 0, alongMeters: 0, point: line[0] };
  let along = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = project(line[i]);
    const b = project(line[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (segLen * segLen)));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < best.distance) {
      best = {
        distance: d,
        segmentIndex: i,
        alongMeters: along + t * segLen,
        point: { lat: p.lat + cy / ky, lng: p.lng + cx / kx },
      };
    }
    along += segLen;
  }
  return best;
}

export type BBox = [south: number, west: number, north: number, east: number];

export function bboxAround(center: LatLng, radiusMeters: number): BBox {
  const dLat = toDeg(radiusMeters / EARTH_RADIUS_M);
  const dLng = dLat / Math.max(0.01, Math.cos(toRad(center.lat)));
  return [center.lat - dLat, center.lng - dLng, center.lat + dLat, center.lng + dLng];
}

export function bboxCenter([s, w, n, e]: BBox): LatLng {
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/** Rough bbox diagonal in meters — used to cap how big an area a query may cover. */
export function bboxDiagonalMeters([s, w, n, e]: BBox): number {
  return distanceMeters({ lat: s, lng: w }, { lat: n, lng: e });
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}
