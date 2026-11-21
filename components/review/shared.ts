// Client helpers for the review app.
import type { ReviewPlace, VoteValue } from "@/lib/review";

export type { ReviewPlace, VoteValue };

export const VOTE_UI: Record<VoteValue, { label: string; icon: string; color: string }> = {
  like: { label: "Like", icon: "♥", color: "#16a34a" },
  maybe: { label: "Undecided", icon: "?", color: "#d97706" },
  nope: { label: "Don't like", icon: "✕", color: "#dc2626" },
  never: { label: "Never", icon: "⛔", color: "#4b5563" },
};

const ICONS: Array<[RegExp, string]> = [
  [/cafe/, "☕"], [/bar|pub|biergarten/, "🍺"], [/ice_cream/, "🍦"], [/restaurant/, "🍽️"],
  [/cave|sinkhole/, "🕳️"], [/mine|quarry/, "⛏️"], [/castle|tower/, "🏰"], [/ruins|abandoned/, "🏚️"],
  [/viewpoint|cliff/, "🔭"], [/waterfall/, "💧"], [/hot spring/, "♨️"], [/gorge|valley|arch/, "🏞️"],
  [/peak/, "⛰️"], [/trail/, "🥾"], [/tunnel/, "🚇"], [/aqueduct/, "🌉"],
];
export const iconFor = (kind: string) => ICONS.find(([r]) => r.test(kind))?.[1] ?? "📍";


export function km(m?: number) {
  if (m === undefined) return "";
  return m < 950 ? `${Math.round(m / 10) * 10} m` : m < 9500 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = (b?: number) => (b === undefined ? "" : DIRS[Math.round(((b % 360) + 360) % 360 / 45) % 8]);

export const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return d < 1 ? "today" : d < 2 ? "yesterday" : d < 60 ? `${Math.round(d)} days ago` : new Date(iso).toISOString().slice(0, 10);
};

export const gmaps = (p: ReviewPlace) =>
  p.googlePlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.googlePlaceId}`
    : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
export const waze = (p: { lat: number; lng: number }) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;

export function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}
