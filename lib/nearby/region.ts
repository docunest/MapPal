import type { LatLng } from "../geo";
import { reverseRegion } from "../nominatim";
import { localLangsFor } from "./languages";

/**
 * Local Wikipedia languages for a point. Falls back to Spanish + Portuguese
 * — this app is for Spain and Portugal — when the region lookup fails.
 */
export async function localLangsAt(center: LatLng): Promise<{ langs: string[]; country?: string; region?: string }> {
  try {
    const r = await reverseRegion(center);
    const langs = localLangsFor(r);
    return { langs: langs.length ? langs : ["es", "pt"], country: r.country, region: r.region };
  } catch {
    return { langs: ["es", "pt"] };
  }
}
