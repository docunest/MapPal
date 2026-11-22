// Reads for the review app: the agent's places (mappal_agent_review + the
// run plans), votes and voters (mappal_vote, mappal_voter), the car's
// positions and sent links, and the agent's indexed tiles.
import { prisma } from "@/lib/db";
import { coordsInLogLine } from "@/lib/agent";
import { photoFrom } from "../domain/filter";
import type { AgentView, ReviewPlace, VoteValue } from "../domain/types";

interface PlanCandidate {
  id: string;
  osmRef: string;
  name: string;
  kind: string;
  category: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
  parking?: { name?: string; distanceM: number };
  photo?: { source: string; page?: string; credit?: string; url?: string };
  googlePlaceId?: string;
}
type PlanJson = { categories: Record<string, { candidates: PlanCandidate[]; backlog?: PlanCandidate[] }> };

const SHOW_TAGS = ["opening_hours", "cuisine", "outdoor_seating", "website", "contact:website", "contact:facebook", "contact:instagram", "phone", "description", "access", "fee", "wikipedia", "ele", "check_date"];
const pickTags = (t: Record<string, string>) => Object.fromEntries(SHOW_TAGS.filter((k) => t?.[k]).map((k) => [k, t[k]]));

const base = (c: PlanCandidate, checked: boolean): ReviewPlace => ({
  key: c.osmRef,
  name: c.name,
  category: c.category,
  kind: c.kind,
  lat: c.lat,
  lng: c.lng,
  checked,
  tags: pickTags(c.tags),
  photo: photoFrom(c.photo),
  parking: c.parking ? { name: c.parking.name, distanceM: c.parking.distanceM } : undefined,
  googlePlaceId: c.googlePlaceId,
  rawTags: c.tags, // for re-sorting into the current use-case tree; dropped before the reply
});

/** Every place any run found: reviewed ones with the newest verdict, the rest unchecked. */
export async function loadPlaces(): Promise<ReviewPlace[]> {
  const [runs, reviews] = await Promise.all([
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 60, select: { id: true, plan: true } }),
    prisma.agentReview.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const candidates = new Map<string, PlanCandidate>(); // runId:candidateId
  const unchecked = new Map<string, PlanCandidate>(); // osmRef → newest
  for (const run of runs) {
    const plan = run.plan as unknown as PlanJson;
    for (const cat of Object.values(plan?.categories ?? {})) {
      for (const c of [...(cat.candidates ?? []), ...(cat.backlog ?? [])]) {
        candidates.set(`${run.id}:${c.id}`, c);
        if (!unchecked.has(c.osmRef)) unchecked.set(c.osmRef, c);
      }
    }
  }
  const out = new Map<string, ReviewPlace>();
  for (const r of reviews) {
    if (out.has(r.osmRef)) continue; // newest review wins
    const c = candidates.get(`${r.runId}:${r.candidate}`);
    const d = r.data as Record<string, never> & {
      vibe?: string; food_tags?: string[]; availability?: { kitchen_hours?: string; peak_times?: string; risks?: Array<{ flag: string; note: string }> };
      price_samples?: AgentView["prices"]; access?: string; how_to_get_there?: string; parking?: string; safety_notes?: string;
      photo?: { source: string; page?: string; credit?: string; url?: string };
      complications?: AgentView["complications"];
      on_map?: boolean; google_maps_url?: string; instagram_url?: string; website?: string; listed_on?: string[];
      price_family_eur?: number; price_tier?: string; price_confidence?: "high" | "medium" | "low"; price_note?: string;
      season_note?: string; event_start?: string; event_end?: string; dogs?: "yes" | "no" | "unknown"; must_do_reason?: string;
    };
    const place: ReviewPlace = c
      ? base(c, true)
      : { key: r.osmRef, name: r.name, category: r.category, kind: r.category, lat: r.lat, lng: r.lng, checked: true, tags: {} };
    place.photo ??= photoFrom(d.photo);
    place.googlePlaceId ??= r.googlePlaceId ?? undefined;
    place.agent = {
      verdict: r.verdict,
      confidence: r.confidence,
      keep: r.keep,
      relevant: r.relevant,
      score: r.score,
      complications: d.complications,
      summary: r.summary,
      vibe: d.vibe,
      foodTags: d.food_tags,
      kitchenHours: d.availability?.kitchen_hours,
      peakTimes: d.availability?.peak_times,
      risks: d.availability?.risks,
      prices: d.price_samples,
      access: d.access,
      howToGetThere: d.how_to_get_there,
      parking: d.parking,
      safety: d.safety_notes,
      evidence: (r.evidence as AgentView["evidence"]) ?? [],
      onMap: d.on_map,
      price: d.price_family_eur !== undefined || d.price_tier ? { familyEur: d.price_family_eur, tier: d.price_tier, confidence: d.price_confidence, note: d.price_note } : undefined,
      seasonNote: d.season_note,
      eventStart: d.event_start,
      eventEnd: d.event_end,
      dogs: d.dogs,
      mustDoReason: d.must_do_reason,
      links: d.google_maps_url || d.instagram_url || d.website ? { google: d.google_maps_url, instagram: d.instagram_url, website: d.website } : undefined,
      listedOn: d.listed_on,
      reviewedAt: r.createdAt.toISOString(),
      runId: r.runId,
    };
    out.set(r.osmRef, place);
  }
  for (const [ref, c] of unchecked) if (!out.has(ref)) out.set(ref, base(c, false));
  return [...out.values()];
}

export async function loadVotes(): Promise<Map<string, Record<string, VoteValue>>> {
  const rows = await prisma.vote.findMany({ select: { voter: true, placeKey: true, vote: true } });
  const out = new Map<string, Record<string, VoteValue>>();
  for (const r of rows) out.set(r.placeKey, { ...(out.get(r.placeKey) ?? {}), [r.voter]: r.vote as VoteValue });
  return out;
}

export const listVoters = async () => (await prisma.voter.findMany({ orderBy: { createdAt: "asc" } })).map((v) => v.name);

export async function addVoter(name: string) {
  await prisma.voter.upsert({ where: { name }, create: { name }, update: {} });
}

export async function setVote(v: { voter: string; placeKey: string; vote: VoteValue | null; name: string; category: string; lat: number; lng: number }) {
  if (v.vote === null) {
    await prisma.vote.deleteMany({ where: { voter: v.voter, placeKey: v.placeKey } });
    return;
  }
  const data = { vote: v.vote, name: v.name, category: v.category, lat: v.lat, lng: v.lng };
  await prisma.vote.upsert({ where: { voter_placeKey: { voter: v.voter, placeKey: v.placeKey } }, create: { voter: v.voter, placeKey: v.placeKey, ...data }, update: data });
  await addVoter(v.voter);
}

/** Where the family has been (GPS) and what they sent to the car, last 180 days. */
export async function loadTravel() {
  const since = new Date(Date.now() - 180 * 86_400_000);
  const [logs, fixes, items] = await Promise.all([
    prisma.dockLog.findMany({ where: { tag: "GPS", at: { gte: since } }, orderBy: { at: "desc" }, take: 20000, select: { msg: true, at: true } }),
    prisma.travelFix.findMany({ where: { kind: "position", at: { gte: since } }, select: { lat: true, lng: true, at: true } }),
    prisma.dockItem.findMany({ where: { createdAt: { gte: since }, lat: { not: null }, lng: { not: null } }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const positions: Array<{ lat: number; lng: number; at: Date }> = [...fixes];
  for (const l of logs) {
    const p = coordsInLogLine(l.msg);
    if (p) positions.push({ ...p, at: l.at });
  }
  for (const i of items) if (i.kind === "bookmark" && i.locatedBy === "gps") positions.push({ lat: i.lat!, lng: i.lng!, at: i.createdAt });
  const sent = items.filter((i) => i.kind === "link").map((i) => ({ id: i.id, title: i.title, lat: i.lat!, lng: i.lng!, at: i.createdAt, openedAt: i.openedAt }));
  return { positions, sent };
}

export async function loadIndex() {
  const [tiles, runs] = await Promise.all([
    prisma.agentTile.findMany({ orderBy: { indexedAt: "desc" }, take: 2000 }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, createdAt: true, finishedAt: true, plan: true } }),
  ]);
  return {
    tiles: tiles.map((t) => ({ geohash: t.geohash, category: t.category, status: t.status, checked: t.checked, kept: t.kept, indexedAt: t.indexedAt.toISOString(), runId: t.runId })),
    runs: runs.map((r) => {
      const z = (r.plan as { zone?: { campsite?: { name?: string; lat: number; lng: number }; target?: { label?: string } } }).zone;
      return { id: r.id, status: r.status, at: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString(), name: z?.campsite?.name ?? z?.target?.label ?? "?", lat: z?.campsite?.lat, lng: z?.campsite?.lng };
    }),
  };
}
