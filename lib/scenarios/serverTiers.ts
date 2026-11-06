// Tiers computed on the server, in the stop's local time (for API callers
// and evidence runs). The app UI can compute the same on the device with
// rankAndTier + the device clock.
import type { LatLng } from "../geo";
import { evaluateHours, loadOpeningHours } from "../openingHours";
import { iberianTimeZone, localWallClock, rankAndTier, type Tiers } from "./tiers";
import type { ResultItem, ScenarioConfig } from "./types";

export async function tiersAt(items: ResultItem[], at: LatLng, config: ScenarioConfig, country?: string, now = new Date()) {
  const OH = await loadOpeningHours();
  const timeZone = iberianTimeZone(at, country);
  const local = localWallClock(now, timeZone);
  const tiers: Tiers = rankAndTier(items, at, config, local, (i, t) =>
    evaluateHours(OH, i.openingHours, { lat: i.lat, lng: i.lng, country }, t),
  );
  return { tiers, timeZone, localTime: local.toTimeString().slice(0, 5), weekday: local.toLocaleDateString("en-GB", { weekday: "long" }) };
}
