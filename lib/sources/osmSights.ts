// OpenStreetMap sights: notable things within the radius, as raw
// candidates (classification happens in lib/nearby/sights.ts so OSM and
// Wikipedia hits are judged by the same rules).
import { distanceMeters, nearestOnPolyline, type LatLng } from "../geo";
import { elementLatLng, type OverpassElement } from "../overpass";
import { isSightNoise } from "../nearby/sightKinds";
import type { SightCandidate } from "./types";

export function buildSightsQuery({ lat, lng }: LatLng, radius: number): string {
  const near = `(around:${radius},${lat},${lng})`;
  const small = `(around:${Math.min(radius, 500)},${lat},${lng})`;
  const lineR = `(around:${Math.min(radius, 1500)},${lat},${lng})`;
  const railR = `(around:${Math.min(radius, 1000)},${lat},${lng})`;
  return `[out:json][timeout:25];
(
  nwr["wikipedia"]${near};
  nwr["wikidata"]["name"]${near};
  nwr["man_made"~"^(works|chimney|gasometer|gasholder|mineshaft|adit|headframe|tower|mast|water_tower|lighthouse|windmill|watermill|dam|bridge|crane|aqueduct)$"]${near};
  nwr["power"="plant"]${near};
  nwr["landuse"~"^(quarry|industrial|harbour|salt_pond)$"]["name"]${near};
  nwr["industrial"]["name"]${near};
  nwr["craft"~"^(brewery|winery|oil_mill)$"]${near};
  nwr["tourism"="wine_cellar"]${near};
  nwr["office"]["name"~"lota|lonja|llotja|lonxa|docapesca",i]${near};
  nwr["railway"~"^(station|halt)$"]${near};
  nwr["aerialway"]["name"]${near};
  nwr["historic"]["historic"!~"^(wayside_cross|wayside_shrine|boundary_stone|milestone|memorial|tomb|grave|yes)$"]${near};
  nwr["historic"="memorial"]["name"]${small};
  nwr["natural"~"^(peak|volcano|gorge|canyon|valley|cliff|arch|rock|stone|spring|hot_spring|ridge)$"]["name"]${near};
  nwr["natural"="cave_entrance"]${near};
  nwr["natural"="water"]["name"]${near};
  nwr["waterway"~"^(waterfall|dam|weir|lock_gate)$"]${near};
  nwr["tourism"~"^(attraction|museum|viewpoint|zoo|aquarium|theme_park)$"]${near};
  nwr["tourism"="artwork"]["name"]${small};
  nwr["amenity"="marketplace"]${near};
  nwr["aeroway"="aerodrome"]["name"]${near};
  nwr["leisure"="stadium"]["name"]${near};
);
out tags center qt;
way["waterway"~"^(river|canal)$"]["name"]${lineR};
out tags geom qt;
way["railway"~"^(rail|narrow_gauge|preserved)$"]${railR}->.rails;
.rails out ids center qt;
rel(bw.rails)["route"="railway"];
out tags qt;`;
}

const osmUrl = (type: string, id: number) => `https://www.openstreetmap.org/${type}/${id}`;

/** Overpass sight elements → candidates. Pure; tested on captured extracts. */
export function sightCandidatesFromElements(center: LatLng, elements: OverpassElement[]): SightCandidate[] {
  const out: SightCandidate[] = [];
  const railCenters: LatLng[] = [];
  const railLines: OverpassElement[] = [];

  for (const el of elements) {
    // `out ids center` rail tracks come without tags.
    if (el.type === "way" && !el.tags) {
      const p = elementLatLng(el);
      if (p) railCenters.push(p);
      continue;
    }
    const t = el.tags ?? {};
    if (el.type === "relation" && t.route === "railway") {
      railLines.push(el);
      continue;
    }
    if (isSightNoise(t, el.type)) continue;

    let point = elementLatLng(el);
    let distance = point ? distanceMeters(center, point) : Infinity;
    if (el.geometry?.length) {
      // Rivers/canals: nearest bank, not the middle of a 5 km way.
      const n = nearestOnPolyline(center, el.geometry.map((g) => ({ lat: g.lat, lng: g.lon })));
      point = n.point;
      distance = n.distance;
    }
    if (!point) continue;
    const wikiTag = /^([a-z-]{2,12}):(.+)$/.exec(t.wikipedia ?? "");
    out.push({
      key: t.wikidata ?? (t.waterway && el.geometry ? `river:${t.name}` : `osm:${el.type}/${el.id}`),
      source: "osm",
      name: t["name:en"] ?? t.name,
      localName: t.name,
      lat: point.lat,
      lng: point.lng,
      distance,
      tags: t,
      osm: `${el.type}/${el.id}`,
      wikidata: /^Q\d+$/.test(t.wikidata ?? "") ? t.wikidata : undefined,
      wiki: wikiTag ? { lang: wikiTag[1], title: wikiTag[2] } : undefined,
      url: osmUrl(el.type, el.id),
    });
  }

  if (railLines.length && railCenters.length) {
    // Which track belongs to which line isn't in the output, so each line
    // through nearby tracks gets the nearest track's distance.
    let nearest = railCenters[0];
    let best = Infinity;
    for (const p of railCenters) {
      const d = distanceMeters(center, p);
      if (d < best) [nearest, best] = [p, d];
    }
    for (const rel of railLines) {
      const t = rel.tags ?? {};
      out.push({
        key: t.wikidata ?? `osm:relation/${rel.id}`,
        source: "osm",
        name: t["name:en"] ?? t.name,
        localName: t.name,
        lat: nearest.lat,
        lng: nearest.lng,
        distance: best,
        tags: t,
        osm: `relation/${rel.id}`,
        wikidata: /^Q\d+$/.test(t.wikidata ?? "") ? t.wikidata : undefined,
        url: osmUrl("relation", rel.id),
      });
    }
  }
  return out;
}
