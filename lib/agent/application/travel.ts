// get_travel_state: where the family is and where they're heading.
import { formatDistance, distanceMeters } from "@/lib/geo";
import { travelState, type TravelState } from "../domain/travelState";
import { loadFixes } from "../infrastructure/travelSources";

export async function getTravelState(): Promise<TravelState> {
  return travelState(await loadFixes());
}

export function travelText(s: TravelState): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const lines = [s.why];
  if (s.position) lines.push(`Position: ${s.position.label} · ${s.position.lat.toFixed(5)},${s.position.lng.toFixed(5)} · ${s.position.source} · ${fmt(s.position.at)}`);
  for (const d of s.destinations.slice(0, 8)) {
    lines.push(`Destination: ${d.label} · ${d.lat.toFixed(5)},${d.lng.toFixed(5)} · ${d.source} · ${fmt(d.at)}${d.arriveOn ? ` · arrive ${d.arriveOn.toISOString().slice(0, 10)}` : ""}${s.position ? ` · ${formatDistance(distanceMeters(d, s.position))} away` : ""}`);
  }
  if (s.target) lines.push(`Run target (plan_run uses it unless you pass lat/lng): ${s.target.label} · ${s.target.lat.toFixed(5)},${s.target.lng.toFixed(5)}`);
  return lines.join("\n");
}
