// Stop zone (design doc: "the campsite plus 2 to 3 nearby towns"): from the
// target point and OSM's campsites/aires and towns around it. Pure, so the
// dry run can explain every choice.
import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo";
import { tilesForCircle } from "./geohash";
import { nameOf } from "./osm";
import type { OsmThing, Zone, ZoneTown } from "./types";

export const CAMP_MAX_M = 5000;
export const TOWN_MAX_M = 10000;
export const EXPLORE_RADIUS_M = 15000;
export const CAMP_CIRCLE_M = 800;

const DEFAULT_POP: Record<string, number> = { city: 50000, town: 5000, village: 600, hamlet: 150 };
const TOWN_RADIUS: Record<string, number> = { city: 1500, town: 900, village: 600, hamlet: 400 };

// Places tagged "hamlet" can still be the valley's main village (Arenas de Cabrales, 717 people).
const popRadius = (pop: number) => (!Number.isFinite(pop) ? 0 : pop >= 20000 ? 1500 : pop >= 3000 ? 900 : pop >= 500 ? 600 : 0);

export function pickZone(target: Zone["target"], things: OsmThing[]): Zone {
  const why: string[] = [];
  // Campsite: nearest camp_site/caravan_site; an unnamed one counts as 1.5× as far.
  const camps = things
    .filter((t) => t.tags.tourism === "camp_site" || t.tags.tourism === "caravan_site")
    .map((t) => ({ t, d: distanceMeters(target, t) }))
    .filter((c) => c.d <= CAMP_MAX_M)
    .sort((a, b) => a.d * (nameOf(a.t.tags) ? 1 : 1.5) - b.d * (nameOf(b.t.tags) ? 1 : 1.5));
  let campsite: Zone["campsite"];
  if (camps.length) {
    const { t, d } = camps[0];
    const kind = t.tags.tourism === "camp_site" ? "campsite" : "camper aire";
    campsite = { lat: t.lat, lng: t.lng, name: nameOf(t.tags) ?? `unnamed ${kind}`, kind, osmRef: t.ref, distanceM: Math.round(d) };
    why.push(`${campsite.name} (${kind}, OSM ${t.ref}) is the nearest place to sleep, ${formatDistance(d)} from the target.`);
  } else {
    campsite = { lat: target.lat, lng: target.lng, name: target.label, kind: "target point", distanceM: 0 };
    why.push(`No campsite or aire within ${CAMP_MAX_M / 1000} km on OSM, so the zone is centred on the target point itself.`);
  }

  // Towns: population (or a default per place type) over (1 + km)², within 10 km.
  const towns: ZoneTown[] = things
    .filter((t) => t.tags.place && nameOf(t.tags))
    .map((t) => {
      const place = t.tags.place;
      const pop = Number(t.tags.population);
      const d = distanceMeters(campsite, t);
      return {
        lat: t.lat,
        lng: t.lng,
        name: nameOf(t.tags)!,
        place,
        population: Number.isFinite(pop) && pop > 0 ? pop : undefined,
        distanceM: Math.round(d),
        radiusM: Math.max(TOWN_RADIUS[place] ?? 400, popRadius(pop)),
        score: (Number.isFinite(pop) && pop > 0 ? pop : DEFAULT_POP[place] ?? 100) / (1 + d / 1000) ** 2,
      };
    })
    .filter((t) => t.distanceM <= TOWN_MAX_M)
    .sort((a, b) => b.score - a.score)
    .filter((t, i, all) => all.findIndex((o) => distanceMeters(o, t) < 1500) === i)
    .slice(0, 3)
    .map((t) => ({ lat: t.lat, lng: t.lng, name: t.name, place: t.place, population: t.population, distanceM: t.distanceM, radiusM: t.radiusM }));
  if (towns.length) {
    why.push(
      `Towns (biggest and closest first): ${towns.map((t) => `${t.name} (${t.place}${t.population ? ` ${t.population}` : ""}, ${formatDistance(t.distanceM)})`).join(", ")}.`,
    );
  } else why.push(`No town or village within ${TOWN_MAX_M / 1000} km on OSM.`);

  const cafeCircles: Zone["cafeCircles"] = towns.map((t) => ({ lat: t.lat, lng: t.lng, radiusM: t.radiusM, label: t.name }));
  if (!towns.some((t) => distanceMeters(t, campsite) < t.radiusM)) {
    cafeCircles.unshift({ lat: campsite.lat, lng: campsite.lng, radiusM: CAMP_CIRCLE_M, label: campsite.name });
  }
  // Around the target, not the campsite (≤ 5 km apart): lets the server ask OSM for both at once.
  const explore = { lat: target.lat, lng: target.lng, radiusM: EXPLORE_RADIUS_M };
  const tiles = {
    cafes: [...new Set(cafeCircles.flatMap((c) => tilesForCircle(c)))].sort(),
    exploration: tilesForCircle(explore),
  };
  return { target, why: why.join(" "), campsite, towns, cafeCircles, explore, tiles };
}

/** Nearest zone circle to a point (its label), for spreading picks across towns. */
export function nearestCircle(p: LatLng, circles: Array<LatLng & { label: string }>): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of circles) {
    const d = distanceMeters(p, c);
    if (d < bestD) { bestD = d; best = c.label; }
  }
  return best;
}

/** Nearest zone circle to a point, for "420 m from Peniche". */
export function nearLabel(p: LatLng, circles: Array<LatLng & { label: string }>): string {
  let best = circles[0];
  let bestD = Infinity;
  for (const c of circles) {
    const d = distanceMeters(p, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? `${formatDistance(bestD)} from ${best.label}` : "";
}
