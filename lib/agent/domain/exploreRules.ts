// Exploration and adventure, Sample B of the design doc: caves, mines,
// abandoned buildings, gorges, waterfalls and other spots for a real
// adventure or great photos. Cheap OSM rules rank them; the agent checks the
// spot still exists, is reachable and isn't private, from recent evidence.
import { distanceMeters, formatDistance } from "@/lib/geo";
import { geohash } from "./geohash";
import { nameOf, trimTags } from "./osm";
import type { Candidate, Dropped, OsmThing, Zone } from "./types";
import type { RuleResult } from "./cafeRules";

const KINDS: Array<[string, number, (t: Record<string, string>) => boolean]> = [
  ["cave", 3, (t) => t.natural === "cave_entrance"],
  ["mine", 3, (t) => ["adit", "mineshaft", "headframe"].includes(t.man_made) || t.historic === "mine" || t.historic === "mine_shaft"],
  ["hot spring", 3, (t) => t.natural === "hot_spring"],
  ["gorge", 3, (t) => t.natural === "gorge" || t.natural === "canyon"],
  ["abandoned railway tunnel", 2.5, (t) => (t.railway === "abandoned" || t.railway === "disused") && t.tunnel === "yes"],
  ["waterfall", 2.5, (t) => t.waterway === "waterfall"],
  ["abandoned building", 2.5, (t) => !!(t["abandoned:building"] || t["abandoned:man_made"] || t["abandoned:railway"]) || t.ruins === "yes" || t.building === "ruins"],
  ["ruins", 2, (t) => t.historic === "ruins"],
  ["sinkhole", 2, (t) => t.natural === "sinkhole"],
  ["rock arch", 2, (t) => t.natural === "arch"],
  ["castle", 1.5, (t) => t.historic === "castle"],
  ["old tower", 1.5, (t) => t.historic === "tower"],
  ["aqueduct", 1.5, (t) => t.historic === "aqueduct"],
  ["disused quarry", 1.5, (t) => t.landuse === "quarry"],
  ["viewpoint", 1.5, (t) => t.tourism === "viewpoint"],
  // Famous ones only (the query asks for wikidata): the Cares gorge is mapped as a valley.
  ["gorge or valley", 1.5, (t) => t.natural === "valley"],
  ["mountain peak", 1, (t) => t.natural === "peak"],
  // Famous trails (wikidata only), e.g. Ruta del Cares — the gorge itself often isn't a mapped spot.
  ["famous hiking trail", 2, (t) => t.route === "hiking"],
  ["cliff", 1, (t) => t.natural === "cliff"],
];

export const exploreKind = (t: Record<string, string>) => KINDS.find(([, , m]) => m(t));

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function exploreRules(things: OsmThing[], zone: Zone): RuleResult & { parkings: OsmThing[] } {
  const parkings = things.filter((t) => t.tags.amenity === "parking" && t.tags.access !== "private" && t.tags.access !== "no");
  const dropped: Dropped[] = [];
  const kept: Candidate[] = [];
  const seen = new Set<string>();
  for (const t of things) {
    if (t.tags.amenity === "parking" || seen.has(t.ref)) continue;
    if (distanceMeters(zone.explore, t) > zone.explore.radiusM) continue; // the query asks for a box
    seen.add(t.ref);
    const k = exploreKind(t.tags);
    if (!k) continue;
    const [kind, weight] = k;
    const name = nameOf(t.tags);
    const drop = (reason: string) => dropped.push({ name: name ?? `(unnamed ${kind})`, osmRef: t.ref, reason, lat: t.lat, lng: t.lng });
    const famous = !!(t.tags.wikidata || t.tags.wikipedia);
    if (!name && !famous && kind !== "cave" && kind !== "mine") { drop("no name on the map"); continue; }
    if (t.tags.access === "private" || t.tags.access === "no") { drop(`access=${t.tags.access} on the map`); continue; }
    if (kind === "famous hiking trail" && (/^(iwn|nwn)$/.test(t.tags.network ?? "") || /\b(european|long distance|E-?\d+|GR[ -]?\d+)\b/i.test(name ?? ""))) {
      drop("long-distance trail, not a spot");
      continue;
    }
    if (kind === "cave" && !name && !famous && !t.tags.description) { drop("unnamed cave entrance with no description (often a pothole)"); continue; }
    const label = name ?? `unnamed ${kind}`;
    if (name && kept.some((c) => norm(c.name) === norm(name) && distanceMeters(c, t) < 300)) { drop("duplicate of a nearby entry"); continue; }

    const why = [kind];
    let score = weight;
    if (famous) { score += 2; why.push("Wikipedia/Wikidata"); }
    if (name) score += 1;
    if (t.tags.image || t.tags.wikimedia_commons) { score += 0.5; why.push("photo linked"); }
    if (t.tags.description) { score += 0.5; why.push("description"); }
    const d = distanceMeters(zone.campsite, t);
    score -= d / 10000;
    let parking: Candidate["parking"];
    let best = Infinity;
    for (const p of parkings) {
      const pd = distanceMeters(p, t);
      if (pd < best) { best = pd; parking = { name: nameOf(p.tags), distanceM: Math.round(pd), tags: trimTags(p.tags), osmRef: p.ref }; }
    }
    if (parking && parking.distanceM > 3000) parking = undefined;
    kept.push({
      id: "",
      category: "exploration",
      osmRef: t.ref,
      name: label,
      kind,
      lat: t.lat,
      lng: t.lng,
      score: Math.round(score * 100) / 100,
      why,
      near: `${formatDistance(d)} from ${zone.campsite.name}`,
      tile: geohash(t),
      tags: trimTags(t.tags),
      parking,
    });
  }
  kept.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { candidates: kept, dropped, parkings };
}
