// OpenStreetMap via Photon (komoot's free geocoder): the fallback utilities
// source when Overpass is down. Same OSM data, but only name + address —
// no opening hours or fuel types — so it's second choice, not first.
import { MAPPAL_USER_AGENT } from "../overpass";
import { classifyPhoton, UTILITY_TAGS } from "../nearby/utilityKinds";
import type { Source, UtilityCategory, UtilityPlace } from "./types";

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: "N" | "W" | "R";
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    locality?: string;
  };
}

const OSM_TYPE = { N: "node", W: "way", R: "relation" } as const;

/** Photon feature → utility. Pure; tested on captured responses. */
export function utilityFromPhoton(f: PhotonFeature): UtilityPlace | null {
  const p = f.properties;
  const kind = classifyPhoton(p.osm_key, p.osm_value);
  if (!kind || !p.osm_type || !p.osm_id) return null;
  const name = p.name ?? kind.fallbackName;
  if (!name) return null;
  const [lng, lat] = f.geometry.coordinates;
  const osmRef = `${OSM_TYPE[p.osm_type]}/${p.osm_id}`;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const address = [street, p.city ?? p.locality ?? p.district].filter(Boolean).join(", ") || undefined;
  return {
    // Same key as the Overpass source, so the two merge when both answer.
    key: `osm:${osmRef}`,
    category: kind.category,
    kind: kind.kind,
    kindLabel: kind.label,
    icon: kind.icon,
    name,
    lat,
    lng,
    badges: [],
    address,
    sources: [{ source: "photon", url: `https://www.openstreetmap.org/${osmRef}` }],
    refs: { osm: osmRef },
  };
}

async function photonNearest(lat: number, lng: number, radiusKm: number, category: UtilityCategory): Promise<UtilityPlace[]> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("radius", String(Math.max(1, Math.round(radiusKm))));
  url.searchParams.set("limit", "25");
  for (const [k, v] of UTILITY_TAGS[category]) url.searchParams.append("osm_tag", `${k}:${v}`);
  const res = await fetch(url, { headers: { "User-Agent": MAPPAL_USER_AGENT }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features?: PhotonFeature[] };
  return (json.features ?? []).map(utilityFromPhoton).filter((p): p is UtilityPlace => !!p);
}

export const photonSource: Source = {
  meta: {
    id: "photon",
    label: "Photon (OpenStreetMap)",
    type: "places",
    cost: "free",
    ai: false,
    homepage: "https://photon.komoot.io",
    attribution: "© OpenStreetMap contributors",
    description: "OpenStreetMap search by komoot. Backup list of places when Overpass is down (no opening hours).",
    priority: 20,
    nearestFirst: true,
  },
  configured: () => true,
  async utilities(q) {
    // Photon returns nearest-first, so one call per category at the widest
    // radius gives the closest options without adaptive rounds.
    const lists = await Promise.all(
      (Object.entries(q.radius) as Array<[UtilityCategory, number]>).map(([cat, r]) =>
        photonNearest(q.center.lat, q.center.lng, r / 1000, cat),
      ),
    );
    return lists.flat();
  },
};
