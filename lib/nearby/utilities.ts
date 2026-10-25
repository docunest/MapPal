// Utilities orchestrator: fuel, restaurants, groceries around a point.
//
// 1. Free sources in priority order (Overpass, then Photon). The first one
//    that answers wins; Overpass gets wider rounds for categories that came
//    back thin (2 km of restaurants is plenty in Lisbon; the nearest fuel in
//    the Picos de Europa can be 15 km away).
// 2. Paid sources (Google) only fill categories still short after that, and
//    only within their usage caps.
// Every place keeps the list of sources it came from.
import { bearingDegrees, compassLabel, distanceMeters, type LatLng } from "../geo";
import type {
  Source,
  SourceContext,
  SourceNote,
  UtilitiesQuery,
  UtilityCategory,
  UtilityPlace,
} from "../sources/types";
import { SourceCappedError, UTILITY_CATEGORIES } from "../sources/types";

interface CategoryRule {
  startRadius: number;
  maxRadius: number;
  minResults: number;
}

export const CATEGORY_RULES: Record<UtilityCategory, CategoryRule> = {
  fuel: { startRadius: 5000, maxRadius: 30000, minResults: 4 },
  restaurants: { startRadius: 1500, maxRadius: 10000, minResults: 8 },
  groceries: { startRadius: 2500, maxRadius: 15000, minResults: 5 },
};

const PER_CATEGORY_LIMIT = 40;

export interface NearbyUtility extends UtilityPlace {
  distance: number;
  bearing: number;
  compass: string;
}

export interface UtilitiesResult {
  places: NearbyUtility[];
  radius: Partial<Record<UtilityCategory, number>>;
  notes: SourceNote[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Merge places from several sources: same key, or same name within 120 m. */
export function mergeUtilities(lists: UtilityPlace[][]): UtilityPlace[] {
  const out: UtilityPlace[] = [];
  const byKey = new Map<string, UtilityPlace>();
  for (const list of lists) {
    for (const p of list) {
      const existing =
        byKey.get(p.key) ??
        out.find((o) => o.category === p.category && norm(o.name) === norm(p.name) && distanceMeters(o, p) < 120);
      if (!existing) {
        const copy = { ...p, sources: [...p.sources], refs: { ...p.refs }, badges: [...p.badges] };
        out.push(copy);
        byKey.set(p.key, copy);
        continue;
      }
      // Keep the richer record's fields, add the other's sources/refs/badges.
      for (const s of p.sources) if (!existing.sources.some((x) => x.source === s.source)) existing.sources.push(s);
      Object.assign(existing.refs, { ...p.refs, ...existing.refs });
      for (const b of p.badges) if (!existing.badges.includes(b)) existing.badges.push(b);
      existing.openingHours ??= p.openingHours;
      existing.address ??= p.address;
      existing.phone ??= p.phone;
      existing.website ??= p.website;
      existing.brand ??= p.brand;
      byKey.set(p.key, existing);
    }
  }
  return out;
}

function countByCategory(places: UtilityPlace[]): Record<UtilityCategory, number> {
  const c = { fuel: 0, restaurants: 0, groceries: 0 };
  for (const p of places) c[p.category]++;
  return c;
}

function describeError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

export async function findUtilities(
  center: LatLng,
  categories: UtilityCategory[],
  sources: Source[],
  ctx: SourceContext,
): Promise<UtilitiesResult> {
  const cats = categories.filter((c) => (UTILITY_CATEGORIES as readonly string[]).includes(c));
  const notes: SourceNote[] = [];
  const lists: UtilityPlace[][] = [];
  const finalRadius: Partial<Record<UtilityCategory, number>> = {};

  const free = sources.filter((s) => s.meta.cost === "free" && s.utilities);
  const paid = sources.filter((s) => s.meta.cost === "paid" && s.utilities);

  // --- 1. free sources, first that answers wins ---
  let answered = false;
  for (const source of free) {
    try {
      let radius: Partial<Record<UtilityCategory, number>> = Object.fromEntries(
        cats.map((c) => [c, source.meta.nearestFirst ? CATEGORY_RULES[c].maxRadius : CATEGORY_RULES[c].startRadius]),
      );
      const found: UtilityPlace[] = [];
      for (let round = 0; round < 3 && Object.keys(radius).length; round++) {
        Object.assign(finalRadius, radius);
        found.push(...(await source.utilities!({ center, radius } as UtilitiesQuery, ctx)));
        if (source.meta.nearestFirst) break;
        const counts = countByCategory(mergeUtilities([found]));
        const next: Partial<Record<UtilityCategory, number>> = {};
        for (const [cat, r] of Object.entries(radius) as Array<[UtilityCategory, number]>) {
          const rule = CATEGORY_RULES[cat];
          if (counts[cat] < rule.minResults && r < rule.maxRadius) next[cat] = Math.min(rule.maxRadius, r * 3);
        }
        radius = next;
      }
      lists.push(found);
      notes.push({ source: source.meta.id, status: found.length ? "ok" : "empty", message: `${found.length} places` });
      answered = true;
      break;
    } catch (err) {
      notes.push({ source: source.meta.id, status: "failed", message: describeError(err) });
    }
  }

  // --- 2. paid sources fill what's still short ---
  const merged = mergeUtilities(lists);
  const counts = countByCategory(merged);
  const short = cats.filter((c) => counts[c] < CATEGORY_RULES[c].minResults);
  if (short.length) {
    for (const source of paid) {
      try {
        const radius = Object.fromEntries(short.map((c) => [c, CATEGORY_RULES[c].maxRadius]));
        const found = await source.utilities!({ center, radius }, ctx);
        lists.push(found);
        notes.push({
          source: source.meta.id,
          status: found.length ? "ok" : "empty",
          message: `${found.length} places (filled: ${short.join(", ")})`,
        });
      } catch (err) {
        notes.push({
          source: source.meta.id,
          status: err instanceof SourceCappedError ? "capped" : "failed",
          message: describeError(err),
        });
      }
    }
  }

  if (!answered && !lists.some((l) => l.length)) {
    throw new Error(`No place source answered: ${notes.map((n) => `${n.source}: ${n.message}`).join("; ")}`);
  }

  const withGeo = mergeUtilities(lists)
    .filter((p) => cats.includes(p.category))
    .map((p) => {
      const bearing = bearingDegrees(center, p);
      return {
        ...p,
        distance: Math.round(distanceMeters(center, p)),
        bearing: Math.round(bearing),
        compass: compassLabel(bearing),
      };
    })
    .sort((a, b) => a.distance - b.distance);

  const perCat: Record<string, number> = {};
  const places = withGeo.filter((p) => (perCat[p.category] = (perCat[p.category] ?? 0) + 1) <= PER_CATEGORY_LIMIT);
  return { places, radius: finalRadius, notes };
}
