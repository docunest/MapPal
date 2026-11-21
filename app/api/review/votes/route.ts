import { vote } from "@/lib/review";
import { handle } from "../http";

// PUT {voter, placeKey, vote: like|maybe|nope|never|null, name, category, lat, lng}
export const PUT = (req: Request) => handle(async () => vote(await req.json().catch(() => null)));
