import { api, uploadRecording } from "@/domains/reading";
import { jsonOf, loggedIn } from "../../../_session";

// {"kind": "word", "mime": "audio/webm", "data": "<base64>"}: the parent's own voice for one clip.
export async function POST(req: Request, ctx: RouteContext<"/api/reading/items/[id]/recording">) {
  const { id } = await ctx.params;
  return (await loggedIn()) ?? api(async () => uploadRecording(id, await jsonOf(req)))(req);
}
