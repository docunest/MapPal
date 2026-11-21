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
  position: Fix | null;
  destinations: Fix[];
  target: Fix | null;
  why: string;
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

export function travelState(fixes: Fix[], now = new Date()): TravelState {
  const positions = fixes.filter((f) => f.kind === "position").sort((a, b) => b.at.getTime() - a.at.getTime());
  const position = positions[0] ?? null;
  const destinations = fixes
    .filter((f) => f.kind === "destination")
    .filter((f) => !position || distanceMeters(f, position) > 1500)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  if (!position && !destinations.length) return { position, destinations, target: null, why: "No location from any source yet." };

  const age = (f: Fix) => {
    const h = (now.getTime() - f.at.getTime()) / 3_600_000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
  };
  if (!position) {
    const d = destinations[0];
    return { position, destinations, target: d, why: `No position known; using the newest destination, ${d.label} (${d.source}, ${age(d)}).` };
  }
  const posTxt = `Latest position: ${position.label} (${position.source}, ${age(position)}).`;
  // Heading somewhere: a destination shared/added after the latest position, within a day's drive.
  const fresh = destinations.find((d) => d.at > position.at && now.getTime() - d.at.getTime() < 3 * DAY && distanceMeters(d, position) < 400_000);
  if (fresh) {
    return { position, destinations, target: fresh, why: `${posTxt} ${fresh.label} was shared after that (${fresh.source}, ${age(fresh)}, ${formatDistance(distanceMeters(fresh, position))} away), so it is the next likely stop.` };
  }
  // A planned stop with an arrival date in the next 3 days.
  const planned = destinations
    .filter((d) => d.arriveOn && d.arriveOn.getTime() >= now.getTime() - DAY / 2 && d.arriveOn.getTime() - now.getTime() < 3 * DAY)
    .sort((a, b) => a.arriveOn!.getTime() - b.arriveOn!.getTime())[0];
  if (planned) {
    return { position, destinations, target: planned, why: `${posTxt} Planned stop ${planned.label} is due ${planned.arriveOn!.toISOString().slice(0, 10)}, so it is the next likely stop.` };
  }
  return { position, destinations, target: position, why: `${posTxt} No newer destination, so the family is probably staying around here.` };
}
