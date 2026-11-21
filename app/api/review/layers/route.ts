import { layers } from "@/lib/review";
import { handle } from "../http";

// GET /api/review/layers?lat&lng&r — sent-to-car links, the place-index cells around the area, agent runs, travel state.
export const GET = (req: Request) =>
  handle(() => {
    const q = new URL(req.url).searchParams;
    const lat = Number(q.get("lat"));
    const lng = Number(q.get("lng"));
    return layers(q.get("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, radiusKm: Number(q.get("r")) || 30 } : undefined);
  });
