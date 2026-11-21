import { NextResponse } from "next/server";
import { cellsAround, indexArea, indexOverview, newCorrelationId } from "@/lib/agent";

// GET: the place index (cells, layer counts, recent jobs). POST {lat, lng, radiusKm, refresh?, job?}:
// fill missing/stale cells for ~60 s; call again with the same job id until missing is 0. Family login.
export const maxDuration = 120;

// GET ?lat&lng&r: the cells around a point (state, age, count). Without: the whole index.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (q.get("lat") && Number.isFinite(lat) && Number.isFinite(lng)) {
    return NextResponse.json({ cells: await cellsAround({ lat, lng }, Math.min(150, Math.max(1, Number(q.get("r")) || 30))) }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(await indexOverview(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { lat?: number; lng?: number; radiusKm?: number; refresh?: boolean; job?: string };
  if (typeof b.lat !== "number" || typeof b.lng !== "number") return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  const radius = Math.min(150, Math.max(1, Number(b.radiusKm) || 30));
  const job = typeof b.job === "string" && /^idx_\w+$/.test(b.job) ? b.job : newCorrelationId();
  const p = await indexArea({ lat: b.lat, lng: b.lng }, radius, job, 60_000, b.refresh === true);
  return NextResponse.json({ job, ...p });
}
