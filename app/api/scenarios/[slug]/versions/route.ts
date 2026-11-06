import { NextResponse } from "next/server";
import { z } from "zod";
import { caller, scenarioErrorResponse } from "@/lib/scenarios/http";
import { saveScenarioVersion } from "@/lib/scenarios/store";

const Body = z.object({ prompt: z.string().max(8000).optional(), config: z.unknown().optional(), note: z.string().max(300).optional() });

// POST /api/scenarios/:slug/versions {prompt?, config?, note?} — save a new version and make it active.
// Existing results stay; FUTURE/CURRENT stops get the new version on their next run, PAST stops never re-run.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected {prompt?, config?, note?}" }, { status: 400 });
  try {
    const v = await saveScenarioVersion(slug, parsed.data, await caller(req));
    return NextResponse.json({ version: v.version });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}
