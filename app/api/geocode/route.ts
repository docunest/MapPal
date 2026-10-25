import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, upstreamError } from "@/lib/http";
import { normalizeLang } from "@/lib/live/languages";
import { geocode } from "@/lib/nominatim";

// GET /api/geocode?q=Picos de Europa[&lat=..&lng=..] — place search (on submit, not per keystroke).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  if (!q || q.length < 2) return badRequest("q is required");
  try {
    const hits = await geocode(q.slice(0, 200), latLngParam(params), normalizeLang(params.get("lang")));
    return NextResponse.json({ hits });
  } catch (err) {
    return upstreamError(err);
  }
}
