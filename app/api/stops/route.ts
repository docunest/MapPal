import { NextResponse } from "next/server";
import { caller, scenarioErrorResponse } from "@/lib/scenarios/http";
import { createStop, listStops, StopInput } from "@/lib/scenarios/store";

// GET /api/stops — stops (regions = a stop with a radius), with which scenario results they have.
export async function GET() {
  try {
    return NextResponse.json({ stops: await listStops() });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}

// POST /api/stops {lat, lng, name?, radiusKm?, status?, arriveOn?, note?} — country/region come from Nominatim.
export async function POST(req: Request) {
  const parsed = StopInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  try {
    return NextResponse.json({ stop: await createStop(parsed.data, await caller(req)) }, { status: 201 });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}
