import { NextResponse } from "next/server";
import { z } from "zod";
import { scenarioErrorResponse } from "@/lib/scenarios/http";
import { runScenarioAtStop } from "@/lib/scenarios/store";

export const maxDuration = 120;

const Body = z.object({ stopId: z.string().min(1), force: z.boolean().optional() });

// POST /api/scenarios/:slug/run {stopId, force?} — run the active version at a stop and cache it.
// Returns the cached result when one exists (force re-runs FUTURE/CURRENT stops; PAST stops never re-run).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected {stopId, force?}" }, { status: 400 });
  try {
    return NextResponse.json({ result: await runScenarioAtStop(slug, parsed.data.stopId, { force: parsed.data.force }) });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}
