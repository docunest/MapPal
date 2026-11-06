// Bottom-up agent (v1, deterministic — no AI): one Overpass query for the
// scenario's OSM tags, its local-language name keywords and the brand names
// from the top-down plan, inside the stop's radius. It also proposes chains
// the brand list missed: names that occur several times in the area.
import { elementLatLng, qlString, type OverpassElement } from "../overpass";
import { addressFromTags } from "../nearby/utilityKinds";
import { matchBrand, normalize } from "./brands";
import type { MatchReason, ScenarioConfig, Tag, TopDownPlan } from "./types";

export interface Candidate {
  key: string;
  osmRef: string;
  name: string;
  brand?: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
  kind: string;
  matchedBy: MatchReason[];
  lastEdited?: string;
  address?: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Overpass QL for one stop. `out center meta` gives the last-edit date (staleness evidence). */
export function buildBottomUpQuery(
  center: { lat: number; lng: number },
  radiusM: number,
  config: ScenarioConfig,
  plan: TopDownPlan,
): string {
  const at = `${Math.round(radiusM)},${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
  const tags: Tag[] = [...config.osmTags, ...plan.extraTags];
  const clauses = tags.map(([k, v]) => `  nwr["${qlString(k)}"="${qlString(v)}"](around:${at});`);
  const names = [...new Set([...config.nameKeywords, ...plan.keywords])].map(escapeRegex);
  const brands = [...new Set(plan.brands.flatMap((t) => t.brands))].map(escapeRegex);
  if (names.length) clauses.push(`  nwr["shop"]["name"~"${qlString(names.join("|"))}",i](around:${at});`);
  if (brands.length) {
    // Whole words only: "Dia" must not pull in every "Peluquería Diana".
    const re = qlString(`(^|[^[:alnum:]])(${brands.join("|")})([^[:alnum:]]|$)`);
    clauses.push(`  nwr["shop"]["name"~"${re}",i](around:${at});`);
    clauses.push(`  nwr["shop"]["brand"~"${re}",i](around:${at});`);
  }
  return `[out:json][timeout:60];\n(\n${clauses.join("\n")}\n);\nout center meta qt;`;
}

const tagKey = (t: Record<string, string>, tags: Tag[]): string | undefined => {
  for (const [k, v] of tags) if (t[k] === v) return `${k}=${v}`;
  return undefined;
};

/** Overpass elements → candidates with how each was matched. Pure. */
export function candidatesFromElements(
  elements: OverpassElement[],
  config: ScenarioConfig,
  plan: TopDownPlan,
): Candidate[] {
  const tags: Tag[] = [...config.osmTags, ...plan.extraTags];
  const keywords = [...new Set([...config.nameKeywords, ...plan.keywords])];
  const out: Candidate[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    const p = elementLatLng(el);
    if (!p) continue;
    const matchedBy: MatchReason[] = [];
    const tk = tagKey(t, tags);
    if (tk) matchedBy.push({ by: "tag", tag: tk });
    const viaTag = matchBrand([t.brand, t.operator], plan.brands);
    const brand = viaTag ?? matchBrand([t.name], plan.brands);
    if (brand) matchedBy.push({ by: "brand", brand: brand.brand, tier: brand.tier, via: viaTag ? "brand-tag" : "name" });
    const nameNorm = normalize(t.name ?? "");
    const kw = keywords.find((k) => nameNorm.includes(normalize(k)));
    if (kw) matchedBy.push({ by: "keyword", keyword: kw });
    if (!matchedBy.length) continue;
    const name = t.name ?? t.brand ?? (brand ? brand.brand : undefined);
    if (!name) continue; // unnamed shops are usually building outlines duplicating a named node
    const shopKind = t.shop ? `shop=${t.shop}` : t.amenity ? `amenity=${t.amenity}` : tk ?? "shop";
    out.push({
      key: `osm:${el.type}/${el.id}`,
      osmRef: `${el.type}/${el.id}`,
      name,
      brand: t.brand,
      lat: p.lat,
      lng: p.lng,
      tags: t,
      kind: shopKind,
      matchedBy,
      lastEdited: (el as OverpassElement & { timestamp?: string }).timestamp?.slice(0, 10),
      address: addressFromTags(t),
    });
  }
  return out;
}

/**
 * Chains the brand list missed: the same normalized name/brand on ≥3 places
 * matched by tag in this area (e.g. a regional supermarket chain). Reported
 * as proposals for the owner/top-down agent and marked on the candidates.
 */
export function frequentNames(cands: Candidate[], min = 3): Array<{ name: string; count: number }> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of cands) {
    if (c.matchedBy.some((m) => m.by === "brand")) continue;
    if (!c.matchedBy.some((m) => m.by === "tag")) continue;
    const label = c.tags.brand ?? c.name;
    const k = normalize(label);
    if (k.length < 3) continue;
    const e = counts.get(k) ?? { name: label, count: 0 };
    e.count++;
    counts.set(k, e);
  }
  return [...counts.values()].filter((e) => e.count >= min).sort((a, b) => b.count - a.count);
}
