import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { bboxCenter, bboxDiagonalMeters, type BBox } from "@/lib/geo";
import { badRequest, upstreamError } from "@/lib/http";
import { runSpots, samplePolyline } from "@/lib/live/spots";

export const maxDuration = 60;

// Bigger areas make Overpass time out and return more spots than anyone can
// look through; zoom in instead.
const MAX_AREA_DIAGONAL_M = 90_000;

// GET /api/spots?bbox=south,west,north,east — photogenic spots in the map view.
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (raw.length !== 4 || raw.some((n) => !Number.isFinite(n))) {
    return badRequest("bbox=south,west,north,east is required");
  }
  const bbox = raw as BBox;
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return badRequest("bbox must be south,west,north,east");
  if (bboxDiagonalMeters(bbox) > MAX_AREA_DIAGONAL_M) {
    return badRequest("That area is too big to scout in one go — zoom in to about 60 km across.");
  }

  try {
    return NextResponse.json(await runSpots({ type: "bbox", bbox }, bboxCenter(bbox)));
  } catch (err) {
    return upstreamError(err);
  }
}

const corridorSchema = z.object({
  line: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2),
  widthKm: z.number().min(0.5).max(15).default(4),
});

// POST /api/spots {line: [{lat,lng}...], widthKm} — spots along a route.
export async function POST(req: Request) {
  const parsed = corridorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected {line: [{lat, lng}, ...], widthKm}");

  const { line, widthKm } = parsed.data;
  // Overpass's `around` with a polyline gets slow beyond a couple hundred
  // vertices; one point every ~3 km is plenty for a 4 km-wide corridor.
  let sampled = samplePolyline(line, 3000);
  if (sampled.length > 220) sampled = samplePolyline(line, Math.ceil((3000 * sampled.length) / 220));

  try {
    return NextResponse.json(await runSpots({ type: "corridor", line: sampled, widthM: widthKm * 1000 }));
  } catch (err) {
    return upstreamError(err);
  }
}
