import { NextResponse } from "next/server";
import { restoreRule, RuleError } from "@/lib/agent";

// POST {version, by}: make an earlier version current again (saved as a new version). Family login.
export async function POST(req: Request, ctx: RouteContext<"/api/agent/rules/[slug]/restore">) {
  const b = (await req.json().catch(() => ({}))) as { version?: number; by?: string };
  try {
    return NextResponse.json(await restoreRule(decodeURIComponent((await ctx.params).slug), Number(b.version), (b.by ?? "app").trim() || "app"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof RuleError ? 400 : 500 });
  }
}
