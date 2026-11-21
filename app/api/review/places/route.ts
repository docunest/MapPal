import { placesFor, scopeFrom } from "@/lib/review";
import { handle } from "../http";

// GET /api/review/places?lat&lng&r=20|all&cat=cafes,exploration&pool=checked|checked-all|everything&voter=Name&mine=unvoted|like|…&other=Agnes&otherStatus=voted|like|unvoted
export const GET = (req: Request) => handle(() => placesFor(scopeFrom(new URL(req.url).searchParams)));
