// Overpass queries for the Phase 0 agent run (docs/PLAN.md → "Hybrid agent
// backend — Phase 0"). Pure strings, so tests and fixture captures use the
// exact same queries as production.
import type { LatLng } from "@/lib/geo";

export interface Circle extends LatLng {
  radiusM: number;
}

const around = (c: Circle) => `(around:${Math.round(c.radiusM)},${c.lat.toFixed(5)},${c.lng.toFixed(5)})`;

/** Campsites/aires near the target point and the towns around them. */
export function zoneQuery(p: LatLng): string {
  const camp = around({ ...p, radiusM: 6000 });
  const towns = around({ ...p, radiusM: 14000 });
  return `[out:json][timeout:25];
(
  nwr["tourism"~"^(camp_site|caravan_site)$"]${camp};
  node["place"~"^(city|town|village)$"]${towns};
  node["place"="hamlet"]["population"]${towns};
  node["place"="hamlet"]["wikipedia"]${towns};
);
out tags center qt;`;
}

/** Every place to eat or drink in the zone's circles (rules drop the misses later). */
export function cafesQuery(circles: Circle[]): string {
  const parts = circles.map((c) => `  nwr["amenity"~"^(cafe|bar|pub|restaurant|ice_cream|fast_food|biergarten)$"]${around(c)};`);
  return `[out:json][timeout:25];
(
${parts.join("\n")}
);
out tags center qt;`;
}

/** Bounding box "(s,w,n,e)" of a circle: Overpass answers bbox filters from its spatial index, much faster than around. */
export function bboxOf(c: Circle): string {
  const dLat = c.radiusM / 111_320;
  const dLng = c.radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  return `(${(c.lat - dLat).toFixed(4)},${(c.lng - dLng).toFixed(4)},${(c.lat + dLat).toFixed(4)},${(c.lng + dLng).toFixed(4)})`;
}

/** Adventure / photo spots around the campsite, plus parking for "where to leave the camper". The rules cut the box back to the circle. */
export function exploreQuery(c: Circle): string {
  const a = bboxOf(c);
  return `[out:json][timeout:60];
(
  nwr["natural"~"^(cave_entrance|gorge|canyon|arch|hot_spring|cliff|sinkhole)$"]${a};
  nwr["waterway"="waterfall"]${a};
  nwr["man_made"~"^(adit|mineshaft|headframe)$"]${a};
  nwr["historic"~"^(mine|mine_shaft|ruins|castle|tower|aqueduct)$"]${a};
  nwr["building"="ruins"]["name"]${a};
  nwr["ruins"="yes"]["name"]${a};
  nwr["abandoned:building"]["name"]${a};
  nwr["abandoned:man_made"]["name"]${a};
  way["railway"~"^(abandoned|disused)$"]["tunnel"="yes"]${a};
  nwr["tourism"="viewpoint"]["name"]${a};
  nwr["natural"~"^(valley|peak)$"]["wikidata"]${a};
  relation["route"="hiking"]["wikidata"]${a};
);
out tags center qt;
nwr["amenity"="parking"]${a};
out tags center qt;`;
}

/** Everything the runs need from one index cell, in one Overpass call (bbox = spatial index). */
export function cellQuery(b: { s: number; w: number; n: number; e: number }, timeoutS = 90): string {
  const a = `(${b.s.toFixed(5)},${b.w.toFixed(5)},${b.n.toFixed(5)},${b.e.toFixed(5)})`;
  return `[out:json][timeout:${timeoutS}];
(
  nwr["amenity"~"^(cafe|bar|pub|restaurant|ice_cream|fast_food|biergarten)$"]${a};
  nwr["tourism"~"^(camp_site|caravan_site)$"]${a};
  node["place"~"^(city|town|village)$"]${a};
  node["place"="hamlet"]["population"]${a};
  node["place"="hamlet"]["wikipedia"]${a};
  nwr["natural"~"^(cave_entrance|gorge|canyon|arch|hot_spring|cliff|sinkhole)$"]${a};
  nwr["waterway"="waterfall"]${a};
  nwr["man_made"~"^(adit|mineshaft|headframe)$"]${a};
  nwr["historic"~"^(mine|mine_shaft|ruins|castle|tower|aqueduct)$"]${a};
  nwr["building"="ruins"]["name"]${a};
  nwr["ruins"="yes"]["name"]${a};
  nwr["abandoned:building"]["name"]${a};
  nwr["abandoned:man_made"]["name"]${a};
  way["railway"~"^(abandoned|disused)$"]["tunnel"="yes"]${a};
  nwr["tourism"="viewpoint"]["name"]${a};
  nwr["natural"~"^(valley|peak)$"]["wikidata"]${a};
  relation["route"="hiking"]["wikidata"]${a};
  nwr["amenity"="parking"]${a};
);
out tags center qt;`;
}
