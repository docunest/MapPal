import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, numParam, upstreamError } from "@/lib/http";
import { normalizeLang } from "@/lib/live/languages";
import { runLens } from "@/lib/live/lens";

export const maxDuration = 60;

// GET /api/lens?lat=..&lng=..&radius=2000&heading=90&lang=en&local=cs
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const center = latLngParam(params);
  if (!center) return badRequest("lat and lng are required");

  const heading = numParam(params, "heading");
  try {
    const result = await runLens({
      center,
      radius: numParam(params, "radius") ?? 2000,
      heading: heading !== undefined && heading >= 0 && heading <= 360 ? heading : undefined,
      userLang: normalizeLang(params.get("lang")),
      localLangHint: params.get("local") ? normalizeLang(params.get("local")) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return upstreamError(err);
  }
}
