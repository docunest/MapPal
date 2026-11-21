import { layers } from "@/lib/review";
import { handle } from "../http";

// GET /api/review/layers — sent-to-car links, indexed tiles, agent runs, latest travel state.
export const GET = () => handle(layers);
