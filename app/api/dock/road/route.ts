import { NextResponse } from "next/server";
import { z } from "zod";
import { dockCaller } from "@/lib/dock/auth";
import { ROAD_LAYERS, corridorPois, osrmRoute, type RoadLayer } from "@/lib/dock/road";

// POST /api/dock/road {from, to, layers?} — Road ahead (docs/DOCK.md): the driving route
// (OSRM public server) and the POIs along it (Overpass corridor), for the head unit to keep
// for the drive. Cached per (from, to) rounded to ~100 m for an hour.
export const maxDuration = 60;

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const bodySchema = z.object({
  from: point,
  to: point,
  layers: z.array(z.enum(Object.keys(ROAD_LAYERS) as [RoadLayer, ...RoadLayer[]])).optional(),
});

type Result = Awaited<ReturnType<typeof build>>;
const cache = new Map<string, { at: number; result: Result }>();
const HOUR = 3600_000;

async function build(from: { lat: number; lng: number }, to: { lat: number; lng: number }, layers: RoadLayer[]) {
  const t0 = Date.now();
  const route = await osrmRoute(from, to);
  const tRoute = Date.now() - t0;
  const { pois, pieces, failedPieces } = await corridorPois(route.line, layers);
  return {
    route: { distanceM: route.distanceM, durationS: route.durationS, line: route.line.map((p) => [Number(p.lat.toFixed(5)), Number(p.lng.toFixed(5))]) },
    pois,
    layers: Object.fromEntries(layers.map((l) => [l, { icon: ROAD_LAYERS[l].icon, label: ROAD_LAYERS[l].label, group: ROAD_LAYERS[l].group }])),
    source: { route: "OSRM (router.project-osrm.org)", pois: "OpenStreetMap (Overpass)", pieces, failedPieces, routeMs: tRoute, totalMs: Date.now() - t0 },
    builtAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { from, to } = parsed.data;
  const layers = parsed.data.layers ?? (Object.keys(ROAD_LAYERS) as RoadLayer[]);
  const key = [from.lat, from.lng, to.lat, to.lng].map((v) => v.toFixed(3)).join(",") + "|" + layers.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOUR) return NextResponse.json({ ...hit.result, cached: true });
  try {
    const result = await build(from, to, layers);
    if (!result.source.failedPieces.length) cache.set(key, { at: Date.now(), result });
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 });
  }
}
