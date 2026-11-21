// The place index (mappal_osm_cell, mappal_osm_place): OpenStreetMap is read
// once per cell and kept for 30 days; runs and the review app read the
// database. A cell too big for one Overpass answer is fetched in quarters.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { distanceMeters, type LatLng } from "@/lib/geo";
import { overpassQuery } from "@/lib/overpass";
import { CELL_FRESH_DAYS, cellBox, cellsForCircle, layerOf, quarters } from "../domain/cells";
import { toThings, trimTags } from "../domain/osm";
import { cellQuery } from "../domain/queries";
import type { OsmThing } from "../domain/types";
import { logEvent } from "./events";

const PARKING_TAGS = ["name", "fee", "maxheight", "access", "surface", "capacity", "parking", "motorhome"];
const msg = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/(Overpass \d{3} from [\w.-]+):.*$/, "$1").trim().slice(0, 200);

type Box = { s: number; w: number; n: number; e: number };
const inBox = (p: LatLng, b: Box) => p.lat >= b.s && p.lat < b.n && p.lng >= b.w && p.lng < b.e;

export interface CellResult {
  cell: string;
  status: "ok" | "failed" | "fresh";
  count: number;
  durationMs: number;
  error?: string;
  byLayer?: Record<string, number>;
}

/** Fetch one cell from Overpass and store it. */
export async function harvestCell(cell: string, correlationId: string, budgetMs = 95_000): Promise<CellResult> {
  const t0 = Date.now();
  const box = cellBox(cell);
  const left = () => budgetMs - (Date.now() - t0);
  let things: OsmThing[] | null = null;
  let how = "whole cell";
  let error: string | undefined;
  try {
    things = toThings(await overpassQuery(cellQuery(box, 60), { timeoutMs: Math.min(65_000, left()), attemptsPerEndpoint: 1, totalBudgetMs: Math.min(70_000, left()) }));
  } catch (e) {
    error = msg(e);
  }
  if (!things && left() > 30_000) {
    // Too big or a busy mirror: four smaller boxes.
    how = "four quarters";
    const parts: OsmThing[] = [];
    try {
      for (const q of quarters(box)) {
        if (left() < 8_000) throw new Error("out of time for the quarters");
        parts.push(...toThings(await overpassQuery(cellQuery(q, 40), { timeoutMs: Math.min(45_000, left()), attemptsPerEndpoint: 1, totalBudgetMs: left() - 2000 })));
      }
      things = parts;
      error = undefined;
    } catch (e) {
      error = `${error}; quarters: ${msg(e)}`;
    }
  }
  const durationMs = Date.now() - t0;
  const center = { lat: (box.s + box.n) / 2, lng: (box.w + box.e) / 2 };
  if (!things) {
    await prisma.osmCell.upsert({ where: { geohash: cell }, create: { geohash: cell, status: "failed", fetchedAt: new Date(), durationMs, error, runId: correlationId }, update: { status: "failed", fetchedAt: new Date(), durationMs, error, runId: correlationId } });
    await logEvent(correlationId, { kind: "index.cell", summary: `cell ${cell}: OpenStreetMap failed (${error})`, data: { cell, status: "failed", durationMs, error, box }, ...center });
    return { cell, status: "failed", count: 0, durationMs, error };
  }
  // Keep each element in the cell its centre falls in (no duplicates across cells).
  const byLayer: Record<string, number> = {};
  const seen = new Set<string>();
  const rows: Prisma.OsmPlaceCreateManyInput[] = [];
  const now = new Date();
  for (const t of things) {
    if (seen.has(t.ref) || !inBox(t, box)) continue;
    seen.add(t.ref);
    const layer = layerOf(t.tags);
    if (!layer) continue;
    byLayer[layer] = (byLayer[layer] ?? 0) + 1;
    const tags = layer === "parking" ? Object.fromEntries(PARKING_TAGS.filter((k) => t.tags[k]).map((k) => [k, t.tags[k]])) : trimTags(t.tags);
    rows.push({ osmRef: t.ref, layer, name: t.tags.name ?? null, lat: t.lat, lng: t.lng, tags, cell, fetchedAt: now });
  }
  await prisma.$transaction(async (tx) => {
    await tx.osmPlace.deleteMany({ where: { cell } });
    for (let i = 0; i < rows.length; i += 2000) await tx.osmPlace.createMany({ data: rows.slice(i, i + 2000), skipDuplicates: true });
    await tx.osmCell.upsert({ where: { geohash: cell }, create: { geohash: cell, status: "ok", fetchedAt: now, count: rows.length, durationMs, runId: correlationId }, update: { status: "ok", fetchedAt: now, count: rows.length, durationMs, error: null, runId: correlationId } });
  }, { timeout: 60_000 });
  await logEvent(correlationId, { kind: "index.cell", summary: `cell ${cell}: ${rows.length} places from OpenStreetMap (${how}, ${Math.round(durationMs / 1000)} s)`, data: { cell, status: "ok", count: rows.length, byLayer, durationMs, how, box }, ...center });
  return { cell, status: "ok", count: rows.length, durationMs, byLayer };
}

export async function cellStates(cells: string[]) {
  const rows = await prisma.osmCell.findMany({ where: { geohash: { in: cells } } });
  return new Map(rows.map((r) => [r.geohash, r]));
}

const isFresh = (r: { status: string; fetchedAt: Date } | undefined) => !!r && r.status === "ok" && Date.now() - r.fetchedAt.getTime() < CELL_FRESH_DAYS * 86_400_000;

export interface IndexProgress {
  cells: number;
  fresh: string[];
  fetched: CellResult[];
  failed: CellResult[];
  missing: string[]; // not fetched yet (out of time) — call again
}

/** Make sure every cell of a circle is in the index, within a time budget. Nearest cells first. */
export async function indexArea(center: LatLng, radiusKm: number, correlationId: string, budgetMs = 95_000, force = false): Promise<IndexProgress> {
  const t0 = Date.now();
  const cells = cellsForCircle({ ...center, radiusM: radiusKm * 1000 });
  const states = await cellStates(cells);
  const fresh = force ? [] : cells.filter((c) => isFresh(states.get(c)));
  const todo = cells.filter((c) => !fresh.includes(c));
  const fetched: CellResult[] = [];
  const failed: CellResult[] = [];
  const missing: string[] = [];
  for (const c of todo) {
    const left = budgetMs - (Date.now() - t0);
    if (left < 25_000) {
      missing.push(c);
      continue;
    }
    const r = await harvestCell(c, correlationId, left - 3000);
    (r.status === "ok" ? fetched : failed).push(r);
  }
  return { cells: cells.length, fresh, fetched, failed, missing };
}

/** Places of some layers within a circle, from the index. */
export async function placesNear(c: LatLng & { radiusM: number }, layers: string[]): Promise<OsmThing[]> {
  const dLat = c.radiusM / 111_320;
  const dLng = c.radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  const rows = await prisma.osmPlace.findMany({
    where: { layer: { in: layers }, lat: { gte: c.lat - dLat, lte: c.lat + dLat }, lng: { gte: c.lng - dLng, lte: c.lng + dLng } },
    select: { osmRef: true, lat: true, lng: true, tags: true },
  });
  return rows.filter((r) => distanceMeters(c, r) <= c.radiusM).map((r) => ({ ref: r.osmRef, lat: r.lat, lng: r.lng, tags: r.tags as Record<string, string> }));
}

export async function indexSummary() {
  const [cells, places] = await Promise.all([
    prisma.osmCell.findMany({ orderBy: { fetchedAt: "desc" }, take: 5000 }),
    prisma.osmPlace.groupBy({ by: ["layer"], _count: true }),
  ]);
  return { cells, places: Object.fromEntries(places.map((p) => [p.layer, p._count])) };
}

/** The index cells around a circle: state, age, count, box — for the Browse map and the reindex buttons. */
export async function cellsAround(c: LatLng, radiusKm: number) {
  const cells = cellsForCircle({ ...c, radiusM: radiusKm * 1000 });
  const states = await cellStates(cells);
  return cells.map((g) => {
    const r = states.get(g);
    const ageDays = r ? Math.round((Date.now() - r.fetchedAt.getTime()) / 86_400_000) : null;
    const status = !r ? "missing" : r.status !== "ok" ? "failed" : ageDays! >= CELL_FRESH_DAYS ? "stale" : "ok";
    return { geohash: g, status, count: r?.count ?? 0, fetchedAt: r?.fetchedAt.toISOString() ?? null, ageDays, error: r?.error ?? null, box: cellBox(g) };
  });
}
