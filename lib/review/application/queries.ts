// Use cases for the review app.
import { loadFixes, travelState } from "@/lib/agent";
import { applyScope, markTravel } from "../domain/filter";
import { geohashBox } from "../domain/geohashBox";
import { VOTES, type MineFilter, type PoolScope, type Scope, type VoteValue } from "../domain/types";
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

export async function placesFor(scope: Scope) {
  const [places, votes, travel] = await Promise.all([loadPlaces(), loadVotes(), loadTravel()]);
  for (const p of places) p.votes = votes.get(p.key) ?? {};
  const picked = applyScope(places, scope);
  markTravel(picked, travel.positions, travel.sent);
  // How big the whole area is, whatever the vote filter, so the UI can say "12 left of 40".
  const inArea = applyScope(places, { ...scope, mine: "any", other: undefined });
  const mine = { unvoted: 0, like: 0, maybe: 0, nope: 0, never: 0 };
  for (const p of inArea) mine[(p.votes?.[scope.voter] as VoteValue | undefined) ?? "unvoted"]++;
  return { places: picked, inArea: inArea.length, mine };
}

export async function layers() {
  const [{ sent }, index, fixes] = await Promise.all([loadTravel(), loadIndex(), loadFixes()]);
  const s = travelState(fixes);
  return {
    sent: sent.map((x) => ({ ...x, at: x.at.toISOString(), openedAt: x.openedAt?.toISOString() ?? null })),
    tiles: index.tiles.map((t) => ({ ...t, box: geohashBox(t.geohash) })),
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
