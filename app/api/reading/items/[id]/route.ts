import { api, itemDetail, patchItem } from "@/domains/reading";
import { jsonOf, loggedIn } from "../../_session";

export async function GET(req: Request, ctx: RouteContext<"/api/reading/items/[id]">) {
  const { id } = await ctx.params;
  return (await loggedIn()) ?? api(async () => itemDetail(id))(req);
}
export async function PATCH(req: Request, ctx: RouteContext<"/api/reading/items/[id]">) {
  const { id } = await ctx.params;
  return (await loggedIn()) ?? api(async () => patchItem(id, await jsonOf(req)))(req);
}
