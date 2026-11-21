// plan_run = the dry run (design doc Phase 0 step 6). Free lookups only:
// OpenStreetMap and the run cache. Nothing is spent on Google or the agent.
import { localLangsAt } from "@/lib/nearby/region";
import { capsFromEnv } from "../domain/caps";
import { buildPlan, planText } from "../domain/plan";
import { emptyCounters, type OsmThing, type Zone } from "../domain/types";
import { travelState } from "../domain/travelState";
import { pickZone } from "../domain/zone";
import { googleConfigured } from "../infrastructure/enrich";
import { cafeThings, exploreThings, zoneThings } from "../infrastructure/osm";
import { createRun, freshlyReviewed } from "../infrastructure/repo";
import { loadFixes } from "../infrastructure/travelSources";
import { EXPLORE_RADIUS_M } from "../domain/zone";

export interface PlanInput {
  lat?: number;
  lng?: number;
  label?: string;
}

// Mirrors answer errors as HTML pages: keep the status line only.
const msg = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(Overpass \d{3} from [\w.-]+):.*$/, "$1")
    .trim()
    .slice(0, 160);

export async function planRun(agent: string, input: PlanInput) {
  let target: Zone["target"];
  let travelWhy: string | undefined;
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    target = { lat: input.lat, lng: input.lng, label: input.label?.slice(0, 80) || `${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}`, source: "given by the agent" };
  } else {
    const s = travelState(await loadFixes());
    if (!s.target) throw new Error("No location known from any source. Share a location from the phone to the car (dock inbox), add a stop, or pass lat/lng.");
    target = { lat: s.target.lat, lng: s.target.lng, label: s.target.label, source: s.target.source, at: s.target.at.toISOString() };
    travelWhy = s.why;
  }

  // Exploration (the slow one) runs alongside zone → cafes.
  const explorePromise = exploreThings({ lat: target.lat, lng: target.lng, radiusM: EXPLORE_RADIUS_M }).then(
    (things) => ({ things }),
    (e) => ({ things: [] as OsmThing[], failed: msg(e) }),
  );
  const placePromise = localLangsAt(target);
  const zoneThingsList = await zoneThings(target).catch((e) => {
    throw new Error(`OpenStreetMap didn't answer for the zone (${msg(e)}). Try again in a minute.`);
  });
  const zone = pickZone(target, zoneThingsList);
  const cafes = await cafeThings(zone.cafeCircles).then(
    (things) => ({ things }),
    (e) => ({ things: [] as OsmThing[], failed: msg(e) }),
  );
  const exploration = await explorePromise;
  const caps = capsFromEnv();
  const refs = [...cafes.things, ...exploration.things].map((t) => t.ref);
  const cached = await freshlyReviewed(refs);
  const place = await placePromise;
  const plan = buildPlan(zone, { cafes, exploration }, cached, caps, googleConfigured(), { country: place.country, lang: place.country?.toUpperCase() === "PT" ? "pt" : "es" });
  if (travelWhy) plan.notes.unshift(`Travel state: ${travelWhy}`);
  const run = await createRun(agent, plan, caps, emptyCounters());
  return { run, text: planText(run.id, plan, caps) };
}
