import { NextResponse, type NextRequest } from "next/server";
import { badRequest, latLngParam } from "@/lib/http";
import { caller, scenarioErrorResponse } from "@/lib/scenarios/http";
import { tiersAt } from "@/lib/scenarios/serverTiers";
import { activeVersion, cachedResult, createStop, runScenarioAtStop, stopCovering } from "@/lib/scenarios/store";

export const maxDuration = 120;

// GET /api/scenarios/:slug/at?lat=..&lng=..[&run=1][&now=ISO]
// The one-tap call: finds the stop covering this point and returns its cached
// result for the active scenario version, ranked and tiered for right now
// (local time at the point). With run=1 and nothing cached, runs live
// (~20 s) — creating a CURRENT stop here if none covers the point.
export async function GET(req: NextRequest, { params: routeParams }: { params: Promise<{ slug: string }> }) {
  const params = req.nextUrl.searchParams;
  const at = latLngParam(params);
  if (!at) return badRequest("lat and lng are required");
  const nowParam = params.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();
  if (Number.isNaN(now.getTime())) return badRequest("now must be an ISO date");
  const { slug } = await routeParams;
  try {
    const { version, config } = await activeVersion(slug);
    let stop = await stopCovering(at);
    let result = stop ? await cachedResult(version.id, stop.id) : null;
    const wasCached = result?.status === "done";
    if (!wasCached && params.get("run") === "1") {
      stop ??= await createStop({ lat: at.lat, lng: at.lng, status: "CURRENT" }, await caller(req));
      result = await runScenarioAtStop(slug, stop.id);
    }
    if (!stop || !result || result.status !== "done") {
      return NextResponse.json({ stop: stop ?? null, version: version.version, cached: false, result: result ?? null });
    }
    const shown = await tiersAt(result.items, at, config, stop.country ?? undefined, now);
    return NextResponse.json({ stop, version: version.version, cached: wasCached, result, ...shown });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}

