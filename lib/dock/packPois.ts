// Road ahead POIs from the monthly OSM packs (the same data the car and the phone keep offline:
// docunest/ANDROID-APPS release "dock-poi", built by .github/workflows/dock-poi.yml) instead of a
// live Overpass corridor query — Overpass timed out from Vercel even for a 48 km route
// (live test 2026-11-16). Only the ~2 MB chunks whose cells the corridor touches are fetched,
// and kept in memory while the function instance is warm. Lookup data (OSM), nothing guessed.
import { gunzipSync } from "node:zlib";
import { PACK_RELEASE, cellsAround, type PackManifest, type PackRow } from "@/lib/offline/packs";
import { ROAD_LAYERS, cumulative, distM, project, type LatLng, type RoadLayer, type RoadPoi } from "./road";

type Chunk = { cc: string; file: string; sha256: string; cells: Set<string>; layers: RoadLayer[]; sourceDate: string };

let manifest: { at: number; chunks: Chunk[] } | null = null;
const MANIFEST_TTL = 30 * 60_000;
const chunkCache = new Map<string, Record<string, PackRow[]>>();
const MAX_CHUNKS = 12;

async function chunksIndex(fetchFn: typeof fetch): Promise<Chunk[]> {
  if (manifest && Date.now() - manifest.at < MANIFEST_TTL) return manifest.chunks;
  const res = await fetchFn(PACK_RELEASE + "poi-manifest.json", { redirect: "follow", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`pack manifest ${res.status}`);
  const m = (await res.json()) as PackManifest;
  const chunks: Chunk[] = [];
  for (const [cc, p] of Object.entries(m.packs)) {
    for (const c of p?.web?.chunks ?? []) {
      // A country whose monthly build failed keeps an older pack without cell lists: skipped.
      const list = (c as { cellList?: string }).cellList;
      if (!list) continue;
      chunks.push({ cc, file: c.file, sha256: c.sha256, cells: new Set(list.split(",")), layers: p!.web!.layers, sourceDate: p!.sourceDate });
    }
  }
  if (!chunks.length) throw new Error("pack manifest has no cell lists yet");
  manifest = { at: Date.now(), chunks };
  return chunks;
}

async function loadChunk(c: Chunk, fetchFn: typeof fetch): Promise<Record<string, PackRow[]>> {
  const hit = chunkCache.get(c.sha256);
  if (hit) {
    chunkCache.delete(c.sha256);
    chunkCache.set(c.sha256, hit); // most recently used last
    return hit;
  }
  const res = await fetchFn(PACK_RELEASE + c.file, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${c.file} ${res.status}`);
  const cells = (JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")) as { cells: Record<string, PackRow[]> }).cells;
  chunkCache.set(c.sha256, cells);
  while (chunkCache.size > MAX_CHUNKS) chunkCache.delete(chunkCache.keys().next().value!);
  return cells;
}

/** Cells (1/4°) within [radiusM] of the route, sampled every ~2 km. */
export function corridorCells(line: LatLng[], radiusM: number, cell = 4): Set<string> {
  const out = new Set<string>();
  const add = (p: LatLng) => cellsAround(p.lat, p.lng, radiusM, cell).forEach((k) => out.add(k));
  add(line[0]);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const steps = Math.max(1, Math.ceil(distM(a, b) / 2000));
    for (let s = 1; s <= steps; s++) add({ lat: a.lat + ((b.lat - a.lat) * s) / steps, lng: a.lng + ((b.lng - a.lng) * s) / steps });
  }
  return out;
}

const OSM_TYPE: Record<string, string> = { n: "node", w: "way", r: "relation" };

/** Pack rows → POIs along the route (same placing rules as the Overpass path). */
export function placeRows(rows: Array<{ row: PackRow; layers: RoadLayer[] }>, want: Set<RoadLayer>, line: LatLng[], cum: number[]): RoadPoi[] {
  const seen = new Set<string>();
  const out: RoadPoi[] = [];
  for (const { row, layers } of rows) {
    const layer = layers[row[0]];
    if (!layer || !want.has(layer) || seen.has(row[6])) continue;
    const at = { lat: row[1] / 1e5, lng: row[2] / 1e5 };
    const pr = project(line, cum, at);
    if (pr.off > ROAD_LAYERS[layer].radius * 1.2 + 50) continue;
    seen.add(row[6]); // border areas: the same object is in two countries' packs
    out.push({
      id: `${OSM_TYPE[row[6][0]] ?? "node"}/${row[6].slice(1)}`,
      layer,
      name: row[3],
      brand: row[4],
      lat: at.lat,
      lng: at.lng,
      km: Math.round(pr.along / 100) / 10,
      offsetM: Math.round(pr.off),
      side: pr.side,
      info: row[5],
    });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** POIs along the route from the packs. Throws when the packs can't be used (caller falls back to Overpass). */
export async function packCorridorPois(line: LatLng[], layers: RoadLayer[], fetchFn: typeof fetch = fetch) {
  const index = await chunksIndex(fetchFn);
  const maxRadius = Math.max(...layers.map((l) => ROAD_LAYERS[l].radius)) * 1.2 + 50;
  const cells = corridorCells(line, maxRadius);
  const needed = index.filter((c) => [...c.cells].some((k) => cells.has(k)));
  const loaded = await Promise.all(needed.map(async (c) => ({ c, cells: await loadChunk(c, fetchFn) })));
  const rows: Array<{ row: PackRow; layers: RoadLayer[] }> = [];
  for (const { c, cells: data } of loaded) {
    for (const k of cells) for (const row of data[k] ?? []) rows.push({ row, layers: c.layers });
  }
  const dates = [...new Set(needed.map((c) => c.sourceDate))].sort();
  return {
    pois: placeRows(rows, new Set(layers), line, cumulative(line)),
    countries: [...new Set(needed.map((c) => c.cc))],
    chunks: needed.length,
    dataDate: dates[0] ?? null,
  };
}
