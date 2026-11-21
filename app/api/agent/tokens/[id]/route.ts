import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/agent";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/agent/tokens/[id]">) {
  try {
    await revokeToken((await ctx.params).id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No such token" }, { status: 404 });
  }
}
