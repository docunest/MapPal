// Everything about one run (or one index job) under its correlation id, for
// the debug page: events in order, location hints, the zone, candidates by
// fate, reviews, index cells — all with coordinates for the map.
import { prisma } from "@/lib/db";
import { cellBox, cellsForCircle } from "../domain/cells";
import { eventsOf } from "../infrastructure/events";
import { getRun, reviewsOf } from "../infrastructure/repo";
import { costLog } from "./finish";

export async function runDebug(runId: string) {
  const [run, events] = await Promise.all([getRun(runId), eventsOf(runId)]);
  const reviews = run ? await reviewsOf(runId) : [];
  const hintsEvent = events.find((e) => e.kind === "location.hints");
  const estimateEvent = events.find((e) => e.kind === "location.estimate");
  let cells: Array<{ geohash: string; status: string; count: number; fetchedAt: string | null; error: string | null; box: ReturnType<typeof cellBox>; fetchedBy: string | null }> = [];
  const around = run ? { lat: run.plan.zone.explore.lat, lng: run.plan.zone.explore.lng, radiusM: run.plan.zone.explore.radiusM + 1000 } : null;
  const jobCells = events.filter((e) => e.kind === "index.cell").map((e) => (e.data as { cell: string }).cell);
  const wanted = [...new Set([...(around ? cellsForCircle(around) : []), ...jobCells])];
  if (wanted.length) {
    const rows = new Map((await prisma.osmCell.findMany({ where: { geohash: { in: wanted } } })).map((r) => [r.geohash, r]));
    cells = wanted.map((g) => {
      const r = rows.get(g);
      return { geohash: g, status: r?.status ?? "missing", count: r?.count ?? 0, fetchedAt: r?.fetchedAt.toISOString() ?? null, error: r?.error ?? null, box: cellBox(g), fetchedBy: r?.runId ?? null };
    });
  }
  const reviewed = new Map(reviews.map((r) => [r.candidate, r]));
  const candidates = run
    ? Object.values(run.plan.categories).flatMap((pc) => [
        ...pc.candidates.map((c) => {
          const r = reviewed.get(c.id);
          return { id: c.id, name: c.name, category: c.category, kind: c.kind, lat: c.lat, lng: c.lng, osmRef: c.osmRef, fate: r ? (r.keep ? "kept" : "not kept") : c.served ? "sent, not reviewed" : "to check", why: c.why.join(", "), verdict: r ? `${r.verdict} ${Math.round(r.confidence * 100)} %` : undefined };
        }),
        ...(pc.backlog ?? []).map((c) => ({ id: c.id, name: c.name, category: c.category, kind: c.kind, lat: c.lat, lng: c.lng, osmRef: c.osmRef, fate: "over the cap (backlog)", why: c.why.join(", ") })),
        ...pc.dropped.filter((d) => d.lat !== undefined).map((d) => ({ id: "", name: d.name, category: "", kind: "", lat: d.lat!, lng: d.lng!, osmRef: d.osmRef, fate: "dropped by rules", why: d.reason })),
      ])
    : [];
  return {
    runId,
    run: run ? { id: run.id, status: run.status, createdAt: run.createdAt.toISOString(), zone: run.plan.zone, notes: run.plan.notes, caps: run.caps, counters: run.counters, cost: costLog(run, reviews) } : null,
    hints: (hintsEvent?.data as { hints?: unknown[] } | undefined)?.hints ?? [],
    destinations: (hintsEvent?.data as { destinations?: unknown[] } | undefined)?.destinations ?? [],
    estimate: estimateEvent?.data ?? null,
    events: events.map((e) => ({ id: e.id, at: e.at.toISOString(), kind: e.kind, summary: e.summary, tokens: e.tokens, lat: e.lat, lng: e.lng })),
    candidates,
    cells,
  };
}

/** The whole place index: every cell with its state, newest first, and the latest index jobs. */
export async function indexOverview() {
  const [cells, layers, jobs] = await Promise.all([
    prisma.osmCell.findMany({ orderBy: { fetchedAt: "desc" }, take: 5000 }),
    prisma.osmPlace.groupBy({ by: ["layer"], _count: true }),
    prisma.agentEvent.groupBy({ by: ["runId"], where: { kind: "index.cell" }, _count: true, _max: { at: true }, orderBy: { _max: { at: "desc" } }, take: 30 }),
  ]);
  return {
    cells: cells.map((c) => ({ geohash: c.geohash, status: c.status, count: c.count, fetchedAt: c.fetchedAt.toISOString(), durationMs: c.durationMs, error: c.error, fetchedBy: c.runId, box: cellBox(c.geohash) })),
    layers: Object.fromEntries(layers.map((l) => [l.layer, l._count])),
    jobs: jobs.map((j) => ({ id: j.runId, cells: j._count, at: j._max.at?.toISOString() })),
  };
}
