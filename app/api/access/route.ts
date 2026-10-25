import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, numParam, upstreamError } from "@/lib/http";
import { DEFAULT_VEHICLE, runAccessCheck } from "@/lib/live/access";

export const maxDuration = 60;

// GET /api/access?lat=..&lng=..[&fromLat=..&fromLng=..][&h=3.1&t=3.5&w=2.3]
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const spot = latLngParam(params);
  if (!spot) return badRequest("lat and lng are required");

  const vehicle = {
    heightM: numParam(params, "h") ?? DEFAULT_VEHICLE.heightM,
    weightT: numParam(params, "t") ?? DEFAULT_VEHICLE.weightT,
    widthM: numParam(params, "w") ?? DEFAULT_VEHICLE.widthM,
  };

  try {
    return NextResponse.json(await runAccessCheck(spot, latLngParam(params, "fromLat", "fromLng"), vehicle));
  } catch (err) {
    return upstreamError(err);
  }
}
