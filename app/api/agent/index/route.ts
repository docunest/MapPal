import { NextResponse } from "next/server";
import { indexArea, indexOverview, newCorrelationId } from "@/lib/agent";

// GET: the place index (cells, layer counts, recent jobs). POST {lat, lng, radiusKm, refresh?, job?}:
// fill missing/stale cells for ~60 s; call again with the same job id until missing is 0. Family login.
export const maxDuration = 120;

export const GET = async () => NextResponse.json(await indexOverview(), { headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { lat?: number; lng?: number; radiusKm?: number; refresh?: boolean; job?: string };
  if (typeof b.lat !== "number" || typeof b.lng !== "number") return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  const radius = Math.min(150, Math.max(1, Number(b.radiusKm) || 30));
  const job = typeof b.job === "string" && /^idx_\w+$/.test(b.job) ? b.job : newCorrelationId();
  const p = await indexArea({ lat: b.lat, lng: b.lng }, radius, job, 60_000, b.refresh === true);
  return NextResponse.json({ job, ...p });
}
