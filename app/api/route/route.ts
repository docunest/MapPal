import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, upstreamError } from "@/lib/http";
import { drivingRoute } from "@/lib/route";

// GET /api/route?fromLat=..&fromLng=..&toLat=..&toLng=..
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const from = latLngParam(params, "fromLat", "fromLng");
  const to = latLngParam(params, "toLat", "toLng");
  if (!from || !to) return badRequest("fromLat, fromLng, toLat and toLng are required");
  try {
    return NextResponse.json(await drivingRoute(from, to));
  } catch (err) {
    return upstreamError(err);
  }
}
