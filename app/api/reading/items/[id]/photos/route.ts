import { api, searchPhotos, uploadPhoto } from "@/domains/reading";
import { jsonOf, loggedIn } from "../../../_session";

export const maxDuration = 60;

// {"jpeg": "<base64>", "camera": true} uploads a photo; {"search": true} fetches more Commons photos.
export async function POST(req: Request, ctx: RouteContext<"/api/reading/items/[id]/photos">) {
  const { id } = await ctx.params;
  return (await loggedIn()) ?? api(async () => {
    const body = await jsonOf(req);
    return body.search ? searchPhotos(id) : uploadPhoto(id, body);
  })(req);
}
