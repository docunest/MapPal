// Travel state (design doc: get_travel_state): the latest known position from
// any source and where the family is heading, then the target for the run.
// The head unit is one source among several, not a requirement.
import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo";

export type FixKind = "position" | "destination";

export interface Fix extends LatLng {
  kind: FixKind;
  source: string; // "car GPS log", "car bookmark", "shared from a phone", "current stop", "planned stop", "car route request"
  label: string;
  at: Date;
  arriveOn?: Date;
}

export interface TravelState {
  position: Fix | null; // the estimate, as a fix
  destinations: Fix[];
  target: Fix | null;
  why: string;
  estimate: LocationEstimate | null;
  hints: Hint[]; // every position hint, newest first, with used/ignored and why
}

const DAY = 86_400_000;
// A shared link that is "here I am" rather than a place to go.
const HERE = /\b(my location|current location|dropped pin|pin colocado|marcador colocado|mi ubicaci[oó]n|ubicaci[oó]n actual|minha localiza[cç][aã]o|localiza[cç][aã]o atual|estou aqui|estoy aqu[ií]|i'?m here)\b/i;

export const isHereLink = (title: string) => HERE.test(title);

/** "lat, lng" in a head-unit GPS log line (any of a few formats), Iberia-ish and Europe sanity range. */
export function coordsInLogLine(msg: string): LatLng | null {
  const named = msg.match(/lat(?:itude)?\s*[=:]\s*(-?\d{1,2}\.\d{3,})[^0-9-]+(?:lng|lon|longitude)\s*[=:]\s*(-?\d{1,3}\.\d{3,})/i);
  const pair = named ?? msg.match(/(-?\d{1,2}\.\d{4,})\s*[,;/ ]\s*(-?\d{1,3}\.\d{4,})/);
  if (!pair) return null;
  const lat = Number(pair[1]);
  const lng = Number(pair[2]);
  if (!(lat > 27 && lat < 72 && lng > -32 && lng < 45)) return null;
  return { lat, lng };
}

// --- Location estimate from many hints ------------------------------------
// Every hint keeps its source and age. Trust per source, halved every 12 h;
// a hint that would need impossible driving from the newest reliable fix is
// set aside as an outlier; the estimate is the weighted centre of the hints
// around the strongest one, with an accuracy circle that grows with age.

export interface Hint extends Fix {
  weight: number; // after age decay
  ageH: number;
  used: boolean;
  note: string;
}

export interface LocationEstimate {
  lat: number;
  lng: number;
  accuracyKm: number;
  confidence: number; // 0..1
  label: string;
  source: string;
  at: Date;
  from: string[]; // hint labels that made it
}

export const SOURCE_TRUST: Array<[RegExp, number, number]> = [
  // [source pattern, trust, accuracy km]
  [/owner pin|set by owner|given by the agent/i, 1, 0.2],
  [/car GPS log/i, 0.9, 0.05],
  [/Road ahead|route request/i, 0.9, 0.1],
  [/car bookmark/i, 0.85, 0.05],
  [/shared from a phone/i, 0.75, 0.5],
  [/current stop/i, 0.5, 5],
];

const trustOf = (source: string) => SOURCE_TRUST.find(([r]) => r.test(source)) ?? [/./, 0.4, 5];
const HALF_LIFE_H = 12;
const MAX_HINT_AGE_H = 14 * 24;
const MAX_SPEED_KMH = 90;

export function estimateLocation(fixes: Fix[], now = new Date()): { estimate: LocationEstimate | null; hints: Hint[] } {
  const hints: Hint[] = fixes
    .filter((f) => f.kind === "position")
    .map((f) => {
      const ageH = Math.max(0, (now.getTime() - f.at.getTime()) / 3_600_000);
      const [, trust] = trustOf(f.source);
      return { ...f, ageH, weight: trust * 0.5 ** (ageH / HALF_LIFE_H), used: false, note: "" };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const h of hints) if (h.ageH > MAX_HINT_AGE_H) h.note = "older than 14 days";

  // Continuity: walk the hints in time order from reliable fix to reliable fix.
  let anchor: Hint | null = null;
  for (const h of hints) {
    if (h.note) continue;
    if (anchor) {
      const km = distanceMeters(anchor, h) / 1000;
      const hours = Math.abs(h.at.getTime() - anchor.at.getTime()) / 3_600_000;
      if (km > MAX_SPEED_KMH * hours + 50) {
        h.note = `outlier: ${Math.round(km)} km from ${anchor.label} (${anchor.source}) only ${hours < 1 ? `${Math.round(hours * 60)} min` : `${Math.round(hours)} h`} apart`;
        continue;
      }
    }
    if (trustOf(h.source)[1] >= 0.85) anchor = h;
  }

  const live = hints.filter((h) => !h.note);
  if (!live.length) return { estimate: null, hints: hints.reverse() };
  const best = live.reduce((a, b) => (b.weight > a.weight ? b : a));
  const members = live.filter((h) => distanceMeters(h, best) <= 25_000);
  const total = members.reduce((s, h) => s + h.weight, 0);
  const lat = members.reduce((s, h) => s + h.lat * h.weight, 0) / total;
  const lng = members.reduce((s, h) => s + h.lng * h.weight, 0) / total;
  for (const h of live) {
    h.used = members.includes(h);
    if (!h.used) h.note = `ignored: ${Math.round(distanceMeters(h, best) / 1000)} km from the strongest hint`;
  }
  const spread = Math.sqrt(members.reduce((s, h) => s + h.weight * (distanceMeters(h, { lat, lng }) / 1000) ** 2, 0) / total);
  // They may have driven on since the newest member: up to 15 km per hour of age, capped.
  const newest = members.reduce((a, b) => (b.at > a.at ? b : a));
  const drift = Math.min(60, newest.ageH * 15);
  const accuracyKm = Math.round(Math.max(trustOf(best.source)[2], spread, drift) * 10) / 10;
  const confidence = Math.round(Math.min(1, best.weight + 0.1 * (members.length - 1)) * 100) / 100;
  return {
    estimate: { lat, lng, accuracyKm, confidence, label: best.label, source: best.source, at: newest.at, from: members.map((m) => `${m.label} (${m.source})`) },
    hints: hints.reverse(),
  };
}

export function travelState(fixes: Fix[], now = new Date()): TravelState {
  const { estimate, hints } = estimateLocation(fixes, now);
  const position: Fix | null = estimate ? { kind: "position", source: estimate.source, label: estimate.label, lat: estimate.lat, lng: estimate.lng, at: estimate.at } : null;
  const destinations = fixes
    .filter((f) => f.kind === "destination")
    .filter((f) => !position || distanceMeters(f, position) > 1500)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const base = { position, destinations, estimate, hints };

  if (!position && !destinations.length) return { ...base, target: null, why: "No location from any source yet." };

  const age = (f: Fix) => {
    const h = (now.getTime() - f.at.getTime()) / 3_600_000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
  };
  if (!position) {
    const d = destinations[0];
    return { ...base, target: d, why: `No position known; using the newest destination, ${d.label} (${d.source}, ${age(d)}).` };
  }
  const posTxt = `Best guess: ${position.label} ±${estimate!.accuracyKm} km (confidence ${Math.round(estimate!.confidence * 100)} %, from ${estimate!.from.length} hint${estimate!.from.length > 1 ? "s" : ""}, newest ${age(position)}).`;
  const fresh = destinations.find((d) => d.at > position.at && now.getTime() - d.at.getTime() < 3 * DAY && distanceMeters(d, position) < 400_000);
  if (fresh) {
    return { ...base, target: fresh, why: `${posTxt} ${fresh.label} was shared after that (${fresh.source}, ${age(fresh)}, ${formatDistance(distanceMeters(fresh, position))} away), so it is the next likely stop.` };
  }
  const planned = destinations
    .filter((d) => d.arriveOn && d.arriveOn.getTime() >= now.getTime() - DAY / 2 && d.arriveOn.getTime() - now.getTime() < 3 * DAY)
    .sort((a, b) => a.arriveOn!.getTime() - b.arriveOn!.getTime())[0];
  if (planned) {
    return { ...base, target: planned, why: `${posTxt} Planned stop ${planned.label} is due ${planned.arriveOn!.toISOString().slice(0, 10)}, so it is the next likely stop.` };
  }
  return { ...base, target: position, why: `${posTxt} No newer destination, so the family is probably around here.` };
}
