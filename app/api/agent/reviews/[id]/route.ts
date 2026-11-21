import { NextResponse } from "next/server";
import { z } from "zod";
import { rateReview } from "@/lib/agent";

// PATCH {rating: "up" | "down" | null} — the owner's 👍/👎 on a kept place
// (the "real and relevant" half of the Phase 0 pass test). Family login.
const body = z.object({ rating: z.enum(["up", "down"]).nullable() });

export async function PATCH(req: Request, ctx: RouteContext<"/api/agent/reviews/[id]">) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "rating must be up, down or null" }, { status: 400 });
  try {
    return NextResponse.json(await rateReview((await ctx.params).id, parsed.data.rating));
  } catch {
    return NextResponse.json({ error: "No such review" }, { status: 404 });
  }
}
