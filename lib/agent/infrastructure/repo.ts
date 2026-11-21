// mappal_agent_* tables.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AgentCategory, Caps, Counters, Plan, RunStatus } from "../domain/types";
import type { ReviewInput } from "../domain/review";

export const FRESH_DAYS = 30;

export interface RunRow {
  id: string;
  status: RunStatus;
  agent: string;
  plan: Plan;
  caps: Caps;
  counters: Counters;
  cappedBy: string | null;
  usageBeforePct: number | null;
  usageAfterPct: number | null;
  model: string | null;
  report: string | null;
  claudeInputTokens: number | null;
  claudeOutputTokens: number | null;
  claudeCacheReadTokens: number | null;
  claudeCacheWriteTokens: number | null;
  approvedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const asRun = (r: Awaited<ReturnType<typeof prisma.agentRun.findUnique>>): RunRow | null =>
  r ? ({ ...r, status: r.status as RunStatus, plan: r.plan as unknown as Plan, caps: r.caps as unknown as Caps, counters: r.counters as unknown as Counters }) : null;

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function createRun(agent: string, plan: Plan, caps: Caps, counters: Counters, id?: string): Promise<RunRow> {
  const r = await prisma.agentRun.create({ data: { ...(id ? { id } : {}), status: "planned", agent, plan: json(plan), caps: json(caps), counters: json(counters) } });
  return asRun(r)!;
}

export const getRun = async (id: string) => asRun(await prisma.agentRun.findUnique({ where: { id } }));

export async function updateRun(
  id: string,
  data: Partial<Pick<RunRow, "status" | "plan" | "counters" | "cappedBy" | "usageBeforePct" | "usageAfterPct" | "model" | "report" | "approvedAt" | "finishedAt" | "claudeInputTokens" | "claudeOutputTokens" | "claudeCacheReadTokens" | "claudeCacheWriteTokens">>,
) {
  const { plan, counters, ...rest } = data;
  await prisma.agentRun.update({ where: { id }, data: { ...rest, ...(plan ? { plan: json(plan) } : {}), ...(counters ? { counters: json(counters) } : {}) } });
}

export async function listRuns(take = 30) {
  return (await prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take })).map((r) => asRun(r)!);
}

/** OSM refs reviewed within the freshness window: the cache (never check twice). */
export async function freshlyReviewed(osmRefs: string[]): Promise<Set<string>> {
  if (!osmRefs.length) return new Set();
  const rows = await prisma.agentReview.findMany({
    where: { osmRef: { in: osmRefs }, createdAt: { gte: new Date(Date.now() - FRESH_DAYS * 86_400_000) } },
    select: { osmRef: true },
  });
  return new Set(rows.map((r) => r.osmRef));
}

export interface ReviewToSave {
  review: ReviewInput;
  category: AgentCategory;
  osmRef: string;
  googlePlaceId?: string;
  name: string;
  lat: number;
  lng: number;
  photo?: { source: string; page?: string; credit?: string; url?: string };
  briefId?: string;
}

export async function saveReviews(runId: string, agent: string, rows: ReviewToSave[]) {
  for (const r of rows) {
    const { candidate, verdict, confidence, relevant, keep, score, summary, evidence, ...rest } = r.review;
    const data = json({ ...rest, ...(r.photo ? { photo: r.photo } : {}) });
    const base = { briefId: r.briefId ?? null, category: r.category, osmRef: r.osmRef, googlePlaceId: r.googlePlaceId ?? null, name: r.name, lat: r.lat, lng: r.lng, verdict, confidence, relevant, keep, score: score === undefined ? null : Math.round(score), summary, data, evidence: json(evidence), agent };
    await prisma.agentReview.upsert({
      where: { runId_candidate: { runId, candidate } },
      create: { runId, candidate, ...base },
      update: base,
    });
    // Provider-neutral place store (mappal_poi): position, ids and the agent's
    // own labels — no Google content.
    const poiData = { agent: { category: r.category, verdict, keep, score, vibe: r.review.vibe, foodTags: r.review.food_tags, access: r.review.access, summary, reviewedAt: new Date().toISOString(), runId } };
    const poi = await prisma.poi.findUnique({ where: { osmRef: r.osmRef }, select: { id: true, data: true, googlePlaceId: true } });
    const merged = json({ ...((poi?.data as object | null) ?? {}), ...poiData });
    if (poi) await prisma.poi.update({ where: { id: poi.id }, data: { name: r.name, lat: r.lat, lng: r.lng, data: merged } });
    else await prisma.poi.create({ data: { name: r.name, lat: r.lat, lng: r.lng, osmRef: r.osmRef, data: merged } });
    if (r.googlePlaceId && !poi?.googlePlaceId) {
      // Unique: another record may already hold this Google id — then leave it.
      await prisma.poi.update({ where: { osmRef: r.osmRef }, data: { googlePlaceId: r.googlePlaceId } }).catch(() => undefined);
    }
  }
}

export const reviewsOf = (runId: string) => prisma.agentReview.findMany({ where: { runId }, orderBy: [{ category: "asc" }, { keep: "desc" }, { confidence: "desc" }] });

export async function rateReview(id: string, rating: "up" | "down" | null) {
  return prisma.agentReview.update({ where: { id }, data: { ownerRating: rating, ownerRatedAt: rating ? new Date() : null }, select: { id: true, ownerRating: true, runId: true } });
}

export async function markTiles(runId: string, tiles: Array<{ geohash: string; category: AgentCategory; status: "indexed" | "partial"; checked: number; kept: number }>) {
  for (const t of tiles) {
    const id = `${t.geohash}:${t.category}`;
    const data = { geohash: t.geohash, category: t.category, status: t.status, runId, checked: t.checked, kept: t.kept, indexedAt: new Date() };
    await prisma.agentTile.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}
