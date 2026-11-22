// Use-case rules as data (the "use-case" layer of a brief): which index
// places count, which are dropped and why, how they're ranked. Stored and
// versioned in mappal_rule_version, editable by people (/review → Config) and
// agents (update_rule). The engine is pure and deterministic: same profile +
// same places → same candidates in the same order.
import { z } from "zod";
import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo";
import { geohash } from "./geohash";
import { nameOf, trimTags } from "./osm";
import { nearestCircle, nearLabel } from "./zone";
import type { Candidate, Dropped, OsmThing, Zone } from "./types";

// Tag matcher: every key must match. Value "*" = present; "~regex" = case-insensitive regex; array = any of.
const matcher = z.record(z.string(), z.union([z.string(), z.array(z.string())]));
const cond = z.object({
  match: matcher.optional(),
  hasAny: z.array(z.string()).optional(), // at least one of these tags present
  missingAll: z.array(z.string()).optional(), // none of these tags present
  noName: z.boolean().optional(),
  regex: z.object({ keys: z.array(z.string()), pattern: z.string() }).optional(), // tested on these tags' values joined by spaces
  kinds: z.array(z.string()).optional(), // only for these kinds
  notKinds: z.array(z.string()).optional(),
});
export type Cond = z.infer<typeof cond>;

const selectCond = cond.extend({ kind: z.string(), points: z.number() });
const dropCond = cond.extend({ reason: z.string() });
const scoreCond = cond.extend({ points: z.number(), label: z.string().optional() });
const slugPart = z.string().regex(/^[a-z][a-z0-9-]*$/);
const layerList = z.array(z.enum(["food", "explore", "parking", "stay", "town"])).min(1);
const areaShape = z.union([z.object({ kind: z.literal("towns") }), z.object({ kind: z.literal("radius"), km: z.number().positive().max(100) })]);

/**
 * One use case as stored (mappal_rule_version.config). Use cases nest:
 * "parent" names another use case (Food → Cafes, Cool bars…). A child
 * inherits every setting it leaves out, and its drop/score rules come after
 * its parents'. A use case without "select" is a group: it runs no brief of
 * its own, it gives its children shared text and rules. The resolved,
 * complete form the engine runs is Profile (see tree.ts → resolveProfile).
 */
export const nodeSchema = z.object({
  useCase: slugPart,
  title: z.string(),
  parent: slugPart.optional(),
  idPrefix: z.string().regex(/^[a-z]{1,3}$/).optional(),
  layers: layerList.optional(),
  area: areaShape.optional(),
  select: z.array(selectCond).default([]),
  drop: z.array(dropCond).default([]),
  score: z.array(scoreCond).default([]),
  distancePenaltyPerKm: z.number().min(0).optional(),
  townEdgePenalty: z.boolean().optional(),
  dedupeByNameWithinM: z.number().min(0).optional(),
  parkingWithinM: z.number().min(0).optional(),
  spreadByTown: z.boolean().optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
  /** Runs without a map list: agents find the places themselves (Discover). A node with neither select nor discover is a group. */
  discover: z.boolean().optional(),
  /** Left out unless asked for by name (Food: the family wants activities first). Inherited by children. */
  offByDefault: z.boolean().optional(),
  /** Look this many days ahead (events, seasonal openings); 0 = not date-bound. */
  windowDays: z.number().int().min(0).max(180).optional(),
  /** Farthest one-way drive for a must-do (area is the normal distance). */
  mustDoKm: z.number().positive().max(300).optional(),
  criteria: z.string().default(""),
});
export type UseCaseNode = z.input<typeof nodeSchema>;

export const profileSchema = z.object({
  useCase: slugPart,
  title: z.string(),
  parent: slugPart.optional(),
  idPrefix: z.string().regex(/^[a-z]{1,3}$/),
  layers: layerList,
  area: areaShape,
  select: z.array(selectCond),
  drop: z.array(dropCond),
  score: z.array(scoreCond),
  distancePenaltyPerKm: z.number().min(0).default(0),
  townEdgePenalty: z.boolean().default(false),
  dedupeByNameWithinM: z.number().min(0).default(0),
  parkingWithinM: z.number().min(0).default(0),
  spreadByTown: z.boolean().default(false),
  pageSize: z.number().int().min(1).max(50),
  discover: z.boolean().default(false),
  offByDefault: z.boolean().default(false),
  windowDays: z.number().int().min(0).max(180).default(0),
  mustDoKm: z.number().positive().max(300).optional(),
  criteria: z.string(), // what the family wants — for the agent, in words
});
export type Profile = z.infer<typeof profileSchema>;

const has = (t: Record<string, string>, k: string) => t[k] !== undefined && t[k] !== "";

function valueMatches(v: string | undefined, want: string | string[]): boolean {
  if (Array.isArray(want)) return want.some((w) => valueMatches(v, w));
  if (want === "*") return v !== undefined && v !== "";
  if (v === undefined) return false;
  if (want.startsWith("~")) return new RegExp(want.slice(1), "i").test(v);
  return v === want;
}

export function condHolds(c: Cond, t: Record<string, string>, kind?: string): boolean {
  if (c.kinds && (!kind || !c.kinds.includes(kind))) return false;
  if (c.notKinds && kind && c.notKinds.includes(kind)) return false;
  if (c.match && !Object.entries(c.match).every(([k, want]) => valueMatches(t[k], want))) return false;
  if (c.hasAny && !c.hasAny.some((k) => has(t, k))) return false;
  if (c.missingAll && c.missingAll.some((k) => has(t, k))) return false;
  if (c.noName && nameOf(t)) return false;
  if (c.regex && !new RegExp(c.regex.pattern, "i").test(c.regex.keys.map((k) => t[k] ?? "").join(" ").replace(/_/g, " "))) return false;
  return true;
}

/** "access={access} on the map" → "access=private on the map". */
const fill = (s: string, t: Record<string, string>) => s.replace(/\{([\w:]+)\}/g, (_, k) => t[k] ?? "?");

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export interface EngineResult {
  found: number;
  candidates: Candidate[]; // every survivor, ranked (ids not assigned yet)
  dropped: Dropped[];
}

/** The deterministic part of a brief: index places → ranked survivors and dropped-with-reason. */
export function runProfile(p: Profile, things: OsmThing[], zone: Zone, parkings: OsmThing[] = []): EngineResult {
  const dropped: Dropped[] = [];
  const kept: Candidate[] = [];
  const center: LatLng = zone.campsite;
  // Stable input order (OSM ref) so ties always break the same way.
  const sorted = [...things].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  const seen = new Set<string>();
  let found = 0;
  for (const t of sorted) {
    if (seen.has(t.ref)) continue;
    seen.add(t.ref);
    const sel = p.select.find((s) => condHolds(s, t.tags));
    if (!sel) continue;
    if (p.area.kind === "radius" && distanceMeters(zone.explore, t) > p.area.km * 1000) continue;
    found++;
    const kind = sel.kind;
    const name = nameOf(t.tags);
    const d = p.drop.find((x) => condHolds(x, t.tags, kind));
    if (d) {
      dropped.push({ name: name ?? `(unnamed ${kind})`, osmRef: t.ref, reason: fill(d.reason, t.tags), lat: t.lat, lng: t.lng });
      continue;
    }
    const label = name ?? `unnamed ${kind}`;
    if (p.dedupeByNameWithinM && name && kept.some((c) => norm(c.name) === norm(name) && distanceMeters(c, t) < p.dedupeByNameWithinM)) {
      dropped.push({ name, osmRef: t.ref, reason: "duplicate of a nearby entry", lat: t.lat, lng: t.lng });
      continue;
    }
    const why = [kind];
    let score = sel.points;
    for (const s of p.score) {
      if (!condHolds(s, t.tags, kind)) continue;
      score += s.points;
      if (s.label) why.push(s.label);
    }
    const dist = distanceMeters(center, t);
    score -= (dist / 1000) * p.distancePenaltyPerKm;
    if (p.townEdgePenalty && zone.cafeCircles.length) score -= Math.min(1, zone.cafeCircles.reduce((best, c) => Math.min(best, distanceMeters(c, t) / c.radiusM), Infinity));
    let parking: Candidate["parking"];
    if (p.parkingWithinM) {
      let best = Infinity;
      for (const pk of parkings) {
        const pd = distanceMeters(pk, t);
        if (pd < best) {
          best = pd;
          parking = { name: nameOf(pk.tags), distanceM: Math.round(pd), tags: trimTags(pk.tags), osmRef: pk.ref };
        }
      }
      if (parking && parking.distanceM > p.parkingWithinM) parking = undefined;
    }
    const byTown = p.area.kind === "towns";
    kept.push({
      id: "",
      category: p.useCase,
      osmRef: t.ref,
      name: label,
      kind,
      lat: t.lat,
      lng: t.lng,
      score: Math.round(score * 100) / 100,
      why,
      near: byTown ? nearLabel(t, zone.cafeCircles) : `${formatDistance(dist)} from ${zone.campsite.name}`,
      circle: byTown && p.spreadByTown ? nearestCircle(t, zone.cafeCircles) : undefined,
      tile: geohash(t),
      tags: trimTags(t.tags),
      parking,
    });
  }
  kept.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || (a.osmRef < b.osmRef ? -1 : 1));
  return { found, candidates: kept, dropped };
}
