import { addItem, api, listForParent } from "@/domains/reading";
import { jsonOf, loggedIn, origin } from "../_session";

export const maxDuration = 60;   // the first call seeds an empty database; adding a word fetches photos and voices

export async function GET(req: Request) {
  return (await loggedIn()) ?? api(async () => listForParent(new URL(req.url).searchParams.get("kind"), origin(req)))(req);
}
export async function POST(req: Request) {
  return (await loggedIn()) ?? api(async () => addItem(await jsonOf(req), origin(req)))(req);
}
