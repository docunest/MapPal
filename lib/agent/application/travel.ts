// get_travel_state / set_location: where the family is (best guess from every
// hint, with the hints themselves so the agent can judge too) and where
// they're heading.
import { formatDistance, distanceMeters } from "@/lib/geo";
import { travelState, type TravelState } from "../domain/travelState";
import { loadFixes, recordFix } from "../infrastructure/travelSources";

export async function getTravelState(): Promise<TravelState> {
  return travelState(await loadFixes());
}

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

export function travelText(s: TravelState): string {
  const lines = [s.why];
  if (s.estimate) {
    const e = s.estimate;
    lines.push(`Estimate: ${e.lat.toFixed(5)},${e.lng.toFixed(5)} ±${e.accuracyKm} km, confidence ${Math.round(e.confidence * 100)} %, from: ${e.from.join("; ")}`);
  }
  lines.push("Position hints (newest first; weight = source trust halved every 12 h):");
  for (const h of s.hints.slice(0, 15)) {
    lines.push(`- ${h.used ? "✓" : "·"} ${h.label} · ${h.lat.toFixed(5)},${h.lng.toFixed(5)} · ${h.source} · ${fmt(h.at)} · weight ${h.weight.toFixed(2)}${h.note ? ` · ${h.note}` : ""}`);
  }
  if (!s.hints.length) lines.push("- none");
  for (const d of s.destinations.slice(0, 8)) {
    lines.push(`Destination: ${d.label} · ${d.lat.toFixed(5)},${d.lng.toFixed(5)} · ${d.source} · ${fmt(d.at)}${d.arriveOn ? ` · arrive ${d.arriveOn.toISOString().slice(0, 10)}` : ""}${s.position ? ` · ${formatDistance(distanceMeters(d, s.position))} away` : ""}`);
  }
  if (s.target) lines.push(`Run target (plan_run uses it unless you pass lat/lng): ${s.target.label} · ${s.target.lat.toFixed(5)},${s.target.lng.toFixed(5)}`);
  lines.push("If these hints disagree with what the owner tells you, call set_location (it outranks every other hint) or pass lat/lng to plan_run.");
  return lines.join("\n");
}

export async function setLocation(args: { lat?: unknown; lng?: unknown; label?: unknown }) {
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("lat and lng required");
  const label = typeof args.label === "string" && args.label.trim() ? args.label.trim().slice(0, 80) : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  await recordFix({ kind: "position", source: "owner pin", lat, lng, label });
  return travelText(await getTravelState());
}
