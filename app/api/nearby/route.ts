import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, upstreamError } from "@/lib/http";
import { ESSENTIAL_CATEGORIES, runNearby, type EssentialCategory } from "@/lib/live/nearby";

export const maxDuration = 60;

// GET /api/nearby?lat=..&lng=..&cats=food,fuel — essentials around a point.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const center = latLngParam(params);
  if (!center) return badRequest("lat and lng are required");

  const requested = (params.get("cats") ?? ESSENTIAL_CATEGORIES.join(","))
    .split(",")
    .filter((c): c is EssentialCategory => (ESSENTIAL_CATEGORIES as readonly string[]).includes(c));
  if (!requested.length) return badRequest(`cats must be some of: ${ESSENTIAL_CATEGORIES.join(", ")}`);

  try {
    return NextResponse.json(await runNearby(center, requested));
  } catch (err) {
    return upstreamError(err);
  }
}
