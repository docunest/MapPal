// OpenStreetMap via Overpass: the primary, free source for utilities (with
// opening hours, fuel types, cuisine) and for sights.
import { elementLatLng, overpassQuery, type OverpassElement } from "../overpass";
import {
  addressFromTags,
  classifyUtility,
  isGone,
  UTILITY_TAGS,
  utilityBadges,
} from "../nearby/utilityKinds";
import { buildSightsQuery, sightCandidatesFromElements } from "./osmSights";
import type { Source, UtilitiesQuery, UtilityCategory, UtilityPlace } from "./types";

export function buildUtilitiesQuery(q: UtilitiesQuery): string {
  const at = `${q.center.lat},${q.center.lng}`;
  const clauses: string[] = [];
  for (const [cat, r] of Object.entries(q.radius) as Array<[UtilityCategory, number]>) {
    for (const [k, v] of UTILITY_TAGS[cat]) clauses.push(`  nwr["${k}"="${v}"](around:${Math.round(r)},${at});`);
  }
  return `[out:json][timeout:20];\n(\n${clauses.join("\n")}\n);\nout tags center qt;`;
}

export function osmUrl(el: { type: string; id: number }): string {
  return `https://www.openstreetmap.org/${el.type}/${el.id}`;
}

/** Overpass element → utility. Pure; also used on test fixtures. */
export function utilityFromElement(el: OverpassElement): UtilityPlace | null {
  const t = el.tags ?? {};
  const kind = classifyUtility(t);
  if (!kind || isGone(t)) return null;
  const p = elementLatLng(el);
  if (!p) return null;
  const brand = t.brand ?? t.operator;
  const name = t.name ?? (kind.category === "fuel" ? brand : undefined) ?? kind.fallbackName;
  // Unnamed restaurants/shops are usually noise (or a building outline
  // duplicating a named node) — skip rather than show "Restaurant".
  if (!name) return null;
  const osmRef = `${el.type}/${el.id}`;
  return {
    key: `osm:${osmRef}`,
    category: kind.category,
    kind: kind.kind,
    kindLabel: kind.label,
    icon: kind.icon,
    name,
    brand: t.brand && t.brand !== name ? t.brand : undefined,
    lat: p.lat,
    lng: p.lng,
    openingHours: t.opening_hours,
    badges: utilityBadges(kind, t),
    address: addressFromTags(t),
    phone: t.phone ?? t["contact:phone"],
    website: t.website ?? t["contact:website"],
    sources: [{ source: "osm", url: osmUrl(el) }],
    refs: { osm: osmRef },
  };
}

export const osmSource: Source = {
  meta: {
    id: "osm",
    label: "OpenStreetMap",
    type: "places",
    cost: "free",
    ai: false,
    homepage: "https://www.openstreetmap.org",
    attribution: "© OpenStreetMap contributors",
    description: "Community map data via the Overpass API: places, opening hours, fuel types, landmarks.",
    priority: 10,
  },
  configured: () => true,
  async utilities(q) {
    // Short budget: when Overpass is struggling, the orchestrator falls back
    // to Photon rather than keeping the driver waiting.
    const elements = await overpassQuery(buildUtilitiesQuery(q), { timeoutMs: 6000, totalBudgetMs: 6000 });
    return elements.map(utilityFromElement).filter((p): p is UtilityPlace => !!p);
  },
  async sights(q) {
    const elements = await overpassQuery(buildSightsQuery(q.center, q.radius), { timeoutMs: 12000, totalBudgetMs: 15000 });
    return sightCandidatesFromElements(q.center, elements);
  },
};
