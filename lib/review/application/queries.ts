// Use cases for the review app.
import { cellsAround, listRules, loadFixes, placesNear, runProfile, travelState, type Zone } from "@/lib/agent";
import { applyScope, markTravel } from "../domain/filter";
import { VOTES, type MineFilter, type PoolScope, type ReviewPlace, type Scope, type VoteValue } from "../domain/types";
import { addVoter, listVoters, loadIndex, loadPlaces, loadTravel, loadVotes, setVote } from "../infrastructure/repo";

export class BadInput extends Error {}

const POOLS: PoolScope[] = ["checked", "checked-all", "everything"];
const MINE: MineFilter[] = ["unvoted", "like", "maybe", "nope", "never", "any"];

export const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, 30) : "");

export function scopeFrom(q: URLSearchParams): Scope {
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new BadInput("lat/lng required");
  const r = q.get("r");
  const voter = cleanName(q.get("voter"));
  if (!voter) throw new BadInput("voter (a name) required");
  const pool = (q.get("pool") ?? "checked") as PoolScope;
  const mine = (q.get("mine") ?? "unvoted") as MineFilter;
  const otherVoter = cleanName(q.get("other"));
  const otherStatus = q.get("otherStatus");
  return {
    lat,
    lng,
    radiusKm: r && r !== "all" && Number(r) > 0 ? Number(r) : null,
    categories: (q.get("cat") ?? "").split(",").filter(Boolean),
    pool: POOLS.includes(pool) ? pool : "checked",
    voter,
    mine: MINE.includes(mine) ? mine : "unvoted",
    other: otherVoter && (otherStatus === "voted" || otherStatus === "like" || otherStatus === "unvoted") ? { voter: otherVoter, status: otherStatus } : undefined,
  };
}

const SHOW_TAGS = ["opening_hours", "cuisine", "outdoor_seating", "website", "contact:website", "phone", "description", "access", "fee", "wikipedia", "ele", "check_date"];

/**
 * "Everything found": the place index itself, through the current use-case
 * rules (same engine as the briefs), so Browse shows what's indexed and not
 * judged yet — not only what an agent pull happened to include.
 */
async function indexPlaces(scope: Scope): Promise<ReviewPlace[]> {
  const radiusM = Math.min(50, scope.radiusKm ?? 50) * 1000;
  const zone: Zone = {
    target: { lat: scope.lat, lng: scope.lng, label: "search area", source: "review" },
    why: "",
    campsite: { lat: scope.lat, lng: scope.lng, name: "the search centre", kind: "pin", distanceM: 0 },
    towns: [],
    cafeCircles: [{ lat: scope.lat, lng: scope.lng, radiusM, label: "search area" }],
    explore: { lat: scope.lat, lng: scope.lng, radiusM },
    tiles: { cafes: [], exploration: [] },
  };
  const rules = (await listRules()).filter((r) => r.layer === "usecase" && r.config && (!scope.categories.length || scope.categories.includes(r.config.useCase)));
  const out: ReviewPlace[] = [];
  for (const r of rules) {
    const p = { ...r.config!, area: { kind: "radius" as const, km: radiusM / 1000 }, townEdgePenalty: false, spreadByTown: false, parkingWithinM: 0 };
    const res = runProfile(p, await placesNear({ lat: scope.lat, lng: scope.lng, radiusM }, p.layers), zone);
    for (const c of res.candidates.slice(0, 1500)) {
      out.push({ key: c.osmRef, name: c.name, category: p.useCase, kind: c.kind, lat: c.lat, lng: c.lng, checked: false, tags: Object.fromEntries(SHOW_TAGS.filter((k) => c.tags[k]).map((k) => [k, c.tags[k]])) });
    }
  }
  return out;
}

export async function placesFor(scope: Scope) {
  const [loaded, votes, travel, fromIndex] = await Promise.all([loadPlaces(), loadVotes(), loadTravel(), scope.pool === "everything" ? indexPlaces(scope) : Promise.resolve([] as ReviewPlace[])]);
  const known = new Set(loaded.map((p) => p.key));
  const places = [...loaded, ...fromIndex.filter((p) => !known.has(p.key))];
  for (const p of places) p.votes = votes.get(p.key) ?? {};
  const picked = applyScope(places, scope);
  markTravel(picked, travel.positions, travel.sent);
  // How big the whole area is, whatever the vote filter, so the UI can say "12 left of 40".
  const inArea = applyScope(places, { ...scope, mine: "any", other: undefined });
  const mine = { unvoted: 0, like: 0, maybe: 0, nope: 0, never: 0 };
  for (const p of inArea) mine[(p.votes?.[scope.voter] as VoteValue | undefined) ?? "unvoted"]++;
  return { places: picked, inArea: inArea.length, mine };
}

export async function layers(around?: { lat: number; lng: number; radiusKm: number }) {
  const [{ sent }, index, fixes] = await Promise.all([loadTravel(), loadIndex(), loadFixes()]);
  const s = travelState(fixes);
  const cells = around ? await cellsAround(around, Math.min(150, around.radiusKm + 10)) : [];
  return {
    sent: sent.map((x) => ({ ...x, at: x.at.toISOString(), openedAt: x.openedAt?.toISOString() ?? null })),
    // The place index around the area: ok (fresh) / stale (> 30 days) / failed / missing.
    tiles: cells.map((c) => ({ geohash: c.geohash, category: "", status: c.status, count: c.count, ageDays: c.ageDays, box: c.box })),
    runs: index.runs,
    travel: {
      position: s.position ? { lat: s.position.lat, lng: s.position.lng, label: s.position.label, source: s.position.source, at: s.position.at.toISOString() } : null,
      target: s.target ? { lat: s.target.lat, lng: s.target.lng, label: s.target.label } : null,
    },
  };
}

export const voters = listVoters;

export async function newVoter(name: unknown) {
  const n = cleanName(name);
  if (!n) throw new BadInput("name required");
  await addVoter(n);
  return n;
}

export async function vote(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const voter = cleanName(b.voter);
  const v = b.vote === null ? null : (b.vote as VoteValue);
  if (!voter) throw new BadInput("voter required");
  if (v !== null && !VOTES.includes(v)) throw new BadInput(`vote must be one of ${VOTES.join(", ")} or null`);
  if (typeof b.placeKey !== "string" || !/^(node|way|relation)\/\d+$/.test(b.placeKey)) throw new BadInput("placeKey like node/123 required");
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadInput("lat/lng required");
  await setVote({ voter, placeKey: b.placeKey, vote: v, name: String(b.name ?? "").slice(0, 120), category: String(b.category ?? "").slice(0, 30), lat, lng });
  return { ok: true };
}
