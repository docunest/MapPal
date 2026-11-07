// Which car places are worth showing up front — the same rule as the head
// unit (docunest/android-apps dock/…/Near.kt): pinned and not-yet-seen
// always; otherwise within 300 km of where you are *or* sent / driven to in
// the last 3 days (the next destination can be far ahead). Unknown distance
// (no pin, or no location) counts as far.
import { distanceMeters, type LatLng } from "../geo";

export const NEAR_M = 300_000;
export const FRESH_MS = 3 * 24 * 60 * 60_000;

export interface NearItem {
  kind: string;
  lat: number | null;
  lng: number | null;
  pinned?: boolean;
  seenAt: string | null;
  openedAt?: string | null;
  createdAt: string;
}

/** Most recent of "sent" and "last driven to". */
export function recency(i: NearItem): number {
  return Math.max(Date.parse(i.createdAt) || 0, i.openedAt ? Date.parse(i.openedAt) || 0 : 0);
}

export function distanceTo(here: LatLng | null, i: NearItem): number | null {
  if (!here || i.lat == null || i.lng == null) return null;
  return distanceMeters(here, { lat: i.lat, lng: i.lng });
}

export function isUpFront(i: NearItem, here: LatLng | null, now = Date.now()): boolean {
  if (i.pinned || (i.kind === "link" && !i.seenAt)) return true;
  if (now - recency(i) < FRESH_MS) return true;
  const d = distanceTo(here, i);
  return d != null && d <= NEAR_M;
}

/** North-up arrow from here to the place. */
export function arrow(here: LatLng, to: LatLng): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - here.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(here.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(here.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - here.lng));
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return "↑↗→↘↓↙←↖"[Math.floor((bearing + 22.5) / 45) % 8];
}

/** The town from a Google-style address ("39180 Noja, Cantabria" → Noja); null if already in the name. */
export function town(address: string | null, title = ""): string | null {
  const parts = (address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const withPostcode = parts.map((p) => p.match(/^\d{4,5}(?:-\d{3})?\s+(.+)$/)?.[1]).find(Boolean);
  const t = withPostcode ?? (/\d/.test(parts[parts.length - 2]) ? null : parts[parts.length - 2]);
  if (!t || t.length < 2 || t.length > 40 || title.toLowerCase().includes(t.toLowerCase())) return null;
  return t;
}
