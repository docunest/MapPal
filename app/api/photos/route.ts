import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, numParam, upstreamError } from "@/lib/http";
import { commonsPhotosNear } from "@/lib/wikimedia";

// GET /api/photos?lat=..&lng=..&r=150&limit=6 — geotagged Commons photos
// taken at a spot, for "what does it actually look like".
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const at = latLngParam(params);
  if (!at) return badRequest("lat and lng are required");
  const radius = Math.min(1000, Math.max(30, numParam(params, "r") ?? 150));
  const limit = Math.min(30, Math.max(1, numParam(params, "limit") ?? 6));
  try {
    const photos = await commonsPhotosNear(at, radius, limit);
    return NextResponse.json({ photos }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    return upstreamError(err);
  }
}
