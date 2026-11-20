import { api, revokeAgentToken } from "@/domains/grocery";

export async function DELETE(req: Request, ctx: RouteContext<"/api/grocery/agents/[id]">) {
  const { id } = await ctx.params;
  return api(async () => ({ agent: await revokeAgentToken(id) }))(req);
}
