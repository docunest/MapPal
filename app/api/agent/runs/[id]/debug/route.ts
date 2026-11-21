import { NextResponse } from "next/server";
import { runDebug } from "@/lib/agent";

// Everything under one correlation id (a run or an index job), for the debug map. Family login.
export async function GET(_req: Request, ctx: RouteContext<"/api/agent/runs/[id]/debug">) {
  return NextResponse.json(await runDebug((await ctx.params).id), { headers: { "Cache-Control": "no-store" } });
}
