// mappal_brief rows and the negative list (places already judged or sent).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Hint } from "../domain/brief";

/** The negative list: places of these use cases (the whole tree, e.g. Food and all its children) within the search area already judged (any time) or sent in an open brief (24 h). */
export interface Known {
  name: string;
  lat?: number;
  lng?: number;
}

export async function knownPlaces(useCases: string[], area: { lat: number; lng: number; radiusM: number }): Promise<Map<string, Known>> {
  const dLat = area.radiusM / 111_320;
  const dLng = area.radiusM / (111_320 * Math.cos((area.lat * Math.PI) / 180));
  const box = { lat: { gte: area.lat - dLat, lte: area.lat + dLat }, lng: { gte: area.lng - dLng, lte: area.lng + dLng } };
  const inBox = (c: { lat?: number; lng?: number }) => c.lat === undefined || c.lng === undefined || (Math.abs(c.lat - area.lat) <= dLat && Math.abs(c.lng - area.lng) <= dLng);
  const [reviews, open] = await Promise.all([
    prisma.agentReview.findMany({ where: { category: { in: useCases }, ...box }, select: { osmRef: true, name: true, lat: true, lng: true } }),
    prisma.brief.findMany({ where: { useCase: { in: useCases }, status: "open", createdAt: { gte: new Date(Date.now() - 86_400_000) } }, select: { candidates: true } }),
  ]);
  const out = new Map<string, Known>();
  for (const r of reviews) out.set(r.osmRef, { name: r.name, lat: r.lat, lng: r.lng });
  for (const b of open) for (const c of b.candidates as Array<{ osmRef: string; name: string; lat?: number; lng?: number }>) if (!out.has(c.osmRef) && inBox(c)) out.set(c.osmRef, { name: c.name, lat: c.lat, lng: c.lng });
  return out;
}

export async function pageNumber(useCase: string, areaKey: string) {
  return (await prisma.brief.count({ where: { useCase, area: { path: ["key"], equals: areaKey } } })) + 1;
}

export async function saveBrief(b: { id: string; runId: string; useCase: string; page: number; layers: unknown; area: unknown; candidates: unknown; excluded: number; hash: string; tokens: number; agent: string }) {
  await prisma.brief.create({ data: { ...b, status: "open", layers: b.layers as Prisma.InputJsonValue, area: b.area as Prisma.InputJsonValue, candidates: b.candidates as Prisma.InputJsonValue } });
}

export const getBrief = (id: string) => prisma.brief.findUnique({ where: { id } });
export const briefsOfRun = (runId: string) => prisma.brief.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });
export const recentBriefs = (take = 50) => prisma.brief.findMany({ orderBy: { createdAt: "desc" }, take });

export async function markSubmittedIfDone(id: string) {
  const b = await prisma.brief.findUnique({ where: { id } });
  if (!b) return;
  const ids = (b.candidates as Array<{ id: string }>).map((c) => c.id);
  const n = await prisma.agentReview.count({ where: { runId: b.runId, candidate: { in: ids } } });
  if (n >= ids.length && b.status !== "submitted") await prisma.brief.update({ where: { id }, data: { status: "submitted", submittedAt: new Date() } });
}

const HINT_TAGS = ["cuisine", "outdoor_seating", "dog", "diet:vegetarian", "live_music", "brewery", "microbrewery", "historic", "natural", "access", "fee"];

/**
 * The family's votes (/review) on places of these use cases, as like/dislike
 * hints for the 0–100 score: counts per place, what the place is (OSM tags
 * from the index), the agent's earlier note. Voter names never leave here.
 */
export async function voteHints(useCases: string[], titles: Record<string, string>): Promise<Hint[]> {
  const votes = await prisma.vote.findMany({ where: { category: { in: useCases }, vote: { in: ["like", "nope", "never"] } }, orderBy: { updatedAt: "desc" }, take: 400 });
  if (!votes.length) return [];
  const refs = [...new Set(votes.map((v) => v.placeKey))];
  const [osm, reviews] = await Promise.all([
    prisma.osmPlace.findMany({ where: { osmRef: { in: refs } }, select: { osmRef: true, tags: true } }),
    prisma.agentReview.findMany({ where: { osmRef: { in: refs } }, orderBy: { createdAt: "desc" }, select: { osmRef: true, summary: true, category: true } }),
  ]);
  const tagsOf = new Map(osm.map((o) => [o.osmRef, o.tags as Record<string, string>]));
  const noteOf = new Map<string, { summary: string; category: string }>();
  for (const r of reviews) if (!noteOf.has(r.osmRef)) noteOf.set(r.osmRef, r);
  const by = new Map<string, Hint>();
  for (const v of votes) {
    let h = by.get(v.placeKey);
    if (!h) {
      const t = tagsOf.get(v.placeKey) ?? {};
      const cat = v.category || noteOf.get(v.placeKey)?.category || "";
      h = { osmRef: v.placeKey, name: v.name, useCase: titles[cat] ?? cat, kind: t.amenity ?? t.tourism ?? t.historic ?? t.natural ?? t.leisure ?? undefined, facts: HINT_TAGS.filter((k) => t[k]).slice(0, 4).map((k) => `${k}=${String(t[k]).slice(0, 40)}`), agentSaid: noteOf.get(v.placeKey)?.summary, likes: 0, dislikes: 0, never: 0, at: v.updatedAt.toISOString() };
      by.set(v.placeKey, h);
    }
    if (v.vote === "like") h.likes++;
    else if (v.vote === "nope") h.dislikes++;
    else h.never++;
  }
  return [...by.values()];
}
