import { NextResponse } from "next/server";
import { ruleHistory, RuleError, saveRule } from "@/lib/agent";

// GET: every version of one layer. PUT {body, config?, title?, note, by}: save a new version. Family login.
type Ctx = RouteContext<"/api/agent/rules/[slug]">;
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof RuleError ? 400 : 500 });

export async function GET(_req: Request, ctx: Ctx) {
  try {
    return NextResponse.json(await ruleHistory(decodeURIComponent((await ctx.params).slug)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const b = (await req.json().catch(() => ({}))) as { body?: string; config?: unknown; title?: string; note?: string; by?: string };
  try {
    return NextResponse.json(await saveRule(decodeURIComponent((await ctx.params).slug), { body: b.body, config: b.config, title: b.title }, (b.by ?? "app").trim() || "app", b.note ?? ""));
  } catch (e) {
    return fail(e);
  }
}
