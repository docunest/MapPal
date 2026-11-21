// Cafes and restaurants, Sample A of the design doc: cheap OSM rules first.
// Want: bar-style places, small hipster bars, genuinely local places families
// go to. Avoid: fancy restaurants, workers' after-shift pubs, fast food,
// chains. Rules only drop what the tags make obvious; the agent judges the
// rest from photos and reviews (vibe needs eyes, not tags).
import { distanceMeters } from "@/lib/geo";
import { geohash } from "./geohash";
import { nameOf, trimTags } from "./osm";
import { nearestCircle, nearLabel } from "./zone";
import type { Candidate, Dropped, OsmThing, Zone } from "./types";

const FANCY = /\b(gourmet|gastron[oó]mico|fine[ _]dining|michelin|haute|degustaci[oó]n|degusta[cç][aã]o)\b/i;
const NO_SPIRIT = /\b(casino|discoteca|disco|night ?club|hotel|resort|catering)\b/i;
const LOCAL_CUISINE = /\b(regional|spanish|portuguese|tapas|seafood|fish|asturian|galician|basque|catalan|local|grill|petiscos)\b/i;

export interface RuleResult {
  candidates: Candidate[];
  dropped: Dropped[];
}

export function cafeRules(things: OsmThing[], zone: Zone): RuleResult {
  const dropped: Dropped[] = [];
  const kept: Candidate[] = [];
  const seen = new Set<string>();
  for (const t of things) {
    const tags = t.tags;
    const amenity = tags.amenity;
    if (!amenity || !/^(cafe|bar|pub|restaurant|ice_cream|fast_food|biergarten)$/.test(amenity)) continue;
    if (seen.has(t.ref)) continue;
    seen.add(t.ref);
    const name = nameOf(tags);
    const drop = (reason: string) => dropped.push({ name: name ?? `(unnamed ${amenity})`, osmRef: t.ref, reason });
    if (!name) { drop("no name on the map"); continue; }
    if (amenity === "fast_food") { drop("fast food"); continue; }
    if (tags.brand || tags["brand:wikidata"]) { drop(`chain (${tags.brand ?? tags["brand:wikidata"]})`); continue; }
    if (tags.opening_hours === "closed" || tags.opening_hours === "off" || Object.keys(tags).some((k) => /^(disused|abandoned|was):amenity$/.test(k))) {
      drop("marked closed on the map");
      continue;
    }
    if (FANCY.test(`${name} ${tags.cuisine ?? ""} ${tags.description ?? ""}`) || tags.stars) { drop("fancy (name/tags say fine dining)"); continue; }
    if (NO_SPIRIT.test(name)) { drop("hotel/club/catering, not a local bar"); continue; }

    const why: string[] = [];
    let score = 0;
    if (amenity === "bar" || amenity === "cafe") { score += 2; why.push(amenity); }
    else if (amenity === "pub" || amenity === "ice_cream" || amenity === "biergarten") { score += 1; why.push(amenity); }
    else why.push("restaurant");
    if (tags.opening_hours) { score += 1; why.push("hours mapped"); }
    if (tags.website || tags["contact:website"] || tags.phone || tags["contact:phone"] || tags["contact:facebook"] || tags["contact:instagram"]) {
      score += 1;
      why.push("contact mapped");
    }
    if (tags.outdoor_seating === "yes") { score += 0.5; why.push("terrace"); }
    if (tags.cuisine && LOCAL_CUISINE.test(tags.cuisine.replace(/_/g, " "))) { score += 1; why.push(`local cuisine (${tags.cuisine})`); }
    // Closer to a zone centre is better, mildly (≤ −1 at the edge of a town circle).
    const centre = zone.cafeCircles.reduce((best, c) => Math.min(best, distanceMeters(c, t) / c.radiusM), Infinity);
    score -= Math.min(1, centre);
    kept.push({
      id: "",
      category: "cafes",
      osmRef: t.ref,
      name,
      kind: amenity,
      lat: t.lat,
      lng: t.lng,
      score: Math.round(score * 100) / 100,
      why,
      near: nearLabel(t, zone.cafeCircles),
      circle: nearestCircle(t, zone.cafeCircles),
      tile: geohash(t),
      tags: trimTags(tags),
    });
  }
  kept.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { candidates: kept, dropped };
}
