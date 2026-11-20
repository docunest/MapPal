import { api, updateEntry, type EntryPatch } from "@/domains/grocery";

export async function PATCH(req: Request, ctx: RouteContext<"/api/grocery/entries/[id]">) {
  const { id } = await ctx.params;
  return api(async ({ member }) => ({ entry: await updateEntry(id, ((await req.json().catch(() => ({}))) as EntryPatch), member) }))(req);
}
