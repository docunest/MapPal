import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, numParam, upstreamError } from "@/lib/http";
import { kindBoosts } from "@/lib/feedback";
import { normalizeLang } from "@/lib/nearby/languages";
import { localLangsAt } from "@/lib/nearby/region";
import { findSights } from "@/lib/nearby/sights";
import { activeSources, sourceContext } from "@/lib/sources/runtime";

export const maxDuration = 60;

// GET /api/nearby/sights?lat=..&lng=..&radius=2000&lang=en
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const center = latLngParam(params);
  if (!center) return badRequest("lat and lng are required");
  const radius = Math.min(3000, Math.max(500, Math.round(numParam(params, "radius") ?? 2000)));
  const userLang = normalizeLang(params.get("lang"));

  try {
    const [region, sights, enrich, boosts] = await Promise.all([
      localLangsAt(center),
      activeSources("sights"),
      activeSources("enrich"),
      kindBoosts().catch(() => ({})),
    ]);
    const result = await findSights(
      { center, radius, userLang, localLangs: region.langs },
      { sights: sights.sources, enrich: enrich.sources },
      sourceContext(),
      boosts,
    );
    return NextResponse.json({
      ...result,
      radius,
      localLangs: region.langs,
      country: region.country,
      notes: [...result.notes, ...sights.skipped, ...enrich.skipped],
    });
  } catch (err) {
    return upstreamError(err);
  }
}
