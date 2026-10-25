import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam, upstreamError } from "@/lib/http";
import { findUtilities } from "@/lib/nearby/utilities";
import { activeSources, sourceContext } from "@/lib/sources/runtime";
import { UTILITY_CATEGORIES, type UtilityCategory } from "@/lib/sources/types";

export const maxDuration = 60;

// GET /api/nearby/utilities?lat=..&lng=..[&cats=fuel,restaurants,groceries]
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const center = latLngParam(params);
  if (!center) return badRequest("lat and lng are required");
  const cats = (params.get("cats") ?? UTILITY_CATEGORIES.join(","))
    .split(",")
    .filter((c): c is UtilityCategory => (UTILITY_CATEGORIES as readonly string[]).includes(c));
  if (!cats.length) return badRequest(`cats must be some of: ${UTILITY_CATEGORIES.join(", ")}`);

  try {
    const { sources, skipped } = await activeSources("utilities");
    const result = await findUtilities(center, cats, sources, sourceContext());
    return NextResponse.json({ ...result, notes: [...result.notes, ...skipped] });
  } catch (err) {
    return upstreamError(err);
  }
}
