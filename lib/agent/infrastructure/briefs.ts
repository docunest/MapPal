// mappal_brief rows and the negative list (places already judged or sent).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
