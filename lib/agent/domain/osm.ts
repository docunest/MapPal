// Overpass elements → OsmThing (pure).
import type { OverpassElement } from "@/lib/overpass";
import type { OsmThing } from "./types";

export function toThings(elements: OverpassElement[]): OsmThing[] {
  const out: OsmThing[] = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (lat === undefined || lng === undefined || !e.tags) continue;
    out.push({ ref: `${e.type}/${e.id}`, lat, lng, tags: e.tags });
  }
  return out;
}

/** Local name first (the region's language), then any name. */
export const nameOf = (t: Record<string, string>) => t.name ?? t["name:es"] ?? t["name:pt"] ?? t["name:ca"] ?? t["name:gl"] ?? t["name:eu"] ?? t["name:en"];

/** Tags worth showing the agent: drop the noisy bookkeeping ones. */
export function trimTags(t: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (/^(source|note:|fixme|FIXME|ref:|addr:(postcode|country|province|state)|created_by|wikimedia_commons|check_date:)/.test(k)) continue;
    if (/^name:/.test(k) && !/^name:(es|pt|en|ca|gl|eu)$/.test(k)) continue;
    out[k] = v.length > 160 ? `${v.slice(0, 157)}…` : v;
  }
  return out;
}
