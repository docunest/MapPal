import { api, generateMissing } from "@/domains/reading";
import { jsonOf, loggedIn } from "../../../_session";

export const maxDuration = 60;

// Makes the Azure clips this item lacks ({"force": true} redoes them after a stress change).
export async function POST(req: Request, ctx: RouteContext<"/api/reading/items/[id]/generate">) {
  const { id } = await ctx.params;
  return (await loggedIn()) ?? api(async () => generateMissing(id, (await jsonOf(req)).force === true))(req);
}
