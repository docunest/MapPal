import { memberFrom, requireToken, Unauthorized } from "@/lib/grocery/auth";
import { updateEntry, type EntryPatch } from "@/lib/grocery/store";

export async function PATCH(req: Request, ctx: RouteContext<"/api/grocery/entries/[id]">) {
  try {
    requireToken(req);
  } catch (err) {
    if (err instanceof Unauthorized) return Response.json({ error: "unauthorized" }, { status: 401 });
    throw err;
  }
  const { id } = await ctx.params;
  const patch = (await req.json().catch(() => ({}))) as EntryPatch;
  const entry = await updateEntry(id, patch, memberFrom(req));
  return Response.json({ entry });
}
