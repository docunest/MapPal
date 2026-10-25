// Scout: photogenic travel stops in an area (or along a route), ranked so
// the not-everyone-has-this-photo places float up. Fame comes from how many
// Wikimedia sites cover a place — the Eiffel Tower has 191, a ruined mill in
// a side valley has 0–2. It's a proxy (we can't read Instagram), but a good
// one for "is this on every travel blog".
import { distanceMeters, nearestOnPolyline, type BBox, type LatLng } from "../geo";
import { elementLatLng, overpassQuery, type OverpassElement } from "../overpass";
import { commonsThumb, wikidataImagesAndFame, type ImageAndFame } from "../wikimedia";

export type SpotGroup = "view" | "water" | "rock" | "history" | "urbex" | "structure" | "art";

export interface SpotKind {
  slug: string;
  label: string;
  icon: string;
  group: SpotGroup;
  weight: number;
}

type Tags = Record<string, string>;

const isAbandoned = (t: Tags) =>
  Object.keys(t).some((k) => /^(abandoned|disused|ruins):(man_made|building|amenity|railway|landuse|industrial|historic)$/.test(k)) ||
  t.building === "ruins" ||
  t.ruins === "yes";

const RULES: Array<SpotKind & { match: (t: Tags) => boolean }> = [
  { slug: "viewpoint", label: "Viewpoint", icon: "🔭", group: "view", weight: 1, match: (t) => t.tourism === "viewpoint" },
  { slug: "lookout-tower", label: "Lookout tower", icon: "🗼", group: "view", weight: 0.9,
    match: (t) => t.man_made === "tower" && t["tower:type"] === "observation" },
  { slug: "waterfall", label: "Waterfall", icon: "💦", group: "water", weight: 1, match: (t) => t.waterway === "waterfall" || t.natural === "waterfall" },
  { slug: "hot-spring", label: "Hot spring", icon: "♨️", group: "water", weight: 1, match: (t) => t.natural === "hot_spring" || t.natural === "geyser" },
  { slug: "swim", label: "Swimming spot", icon: "🏊", group: "water", weight: 0.85,
    match: (t) => t.leisure === "swimming_area" || t.leisure === "bathing_place" || (t.natural === "beach" && !!t.name) },
  { slug: "spring", label: "Spring", icon: "💧", group: "water", weight: 0.5, match: (t) => t.natural === "spring" },
  { slug: "lake", label: "Lake", icon: "🏞️", group: "water", weight: 0.55, match: (t) => t.natural === "water" },
  { slug: "gorge", label: "Gorge / canyon", icon: "🏞️", group: "rock", weight: 1,
    match: (t) => t.natural === "gorge" || t.natural === "canyon" || t.natural === "valley" },
  { slug: "arch", label: "Rock arch", icon: "🌉", group: "rock", weight: 1, match: (t) => t.natural === "arch" },
  { slug: "cave", label: "Cave", icon: "🕳️", group: "rock", weight: 0.85, match: (t) => t.natural === "cave_entrance" },
  { slug: "glacier", label: "Glacier", icon: "🧊", group: "rock", weight: 1, match: (t) => t.natural === "glacier" },
  { slug: "dune", label: "Dunes", icon: "🏜️", group: "rock", weight: 0.9, match: (t) => t.natural === "dune" || (t.natural === "sand" && !!t.name) },
  { slug: "crater", label: "Volcano / crater", icon: "🌋", group: "rock", weight: 0.9,
    match: (t) => t.natural === "volcano" || t.natural === "crater" || t.natural === "sinkhole" },
  { slug: "cliff", label: "Cliff / rocks", icon: "🧗", group: "rock", weight: 0.8,
    match: (t) => ["cliff", "rock", "stone", "bay"].includes(t.natural) },
  { slug: "peak", label: "Peak", icon: "⛰️", group: "rock", weight: 0.55, match: (t) => t.natural === "peak" },
  { slug: "old-tree", label: "Remarkable tree", icon: "🌳", group: "rock", weight: 0.5, match: (t) => t.natural === "tree" },
  { slug: "lost-place", label: "Abandoned place", icon: "🏚️", group: "urbex", weight: 0.9,
    match: (t) => isAbandoned(t) && !t.historic },
  { slug: "castle", label: "Castle", icon: "🏰", group: "history", weight: 0.9, match: (t) => t.historic === "castle" },
  { slug: "ruins", label: "Ruins", icon: "🏚️", group: "history", weight: 0.95, match: (t) => t.historic === "ruins" || t.building === "ruins" },
  { slug: "fort", label: "Fort", icon: "🛡️", group: "history", weight: 0.85, match: (t) => t.historic === "fort" || t.historic === "city_gate" },
  { slug: "monastery", label: "Monastery", icon: "⛪", group: "history", weight: 0.7, match: (t) => t.historic === "monastery" },
  { slug: "old-mine", label: "Old mine", icon: "⛏️", group: "urbex", weight: 0.85, match: (t) => t.historic === "mine" || t.historic === "mine_shaft" },
  { slug: "aqueduct", label: "Aqueduct", icon: "🌉", group: "history", weight: 0.95,
    match: (t) => t.historic === "aqueduct" || t.man_made === "aqueduct" || t.bridge === "aqueduct" },
  { slug: "archaeology", label: "Ancient site", icon: "🏺", group: "history", weight: 0.65, match: (t) => t.historic === "archaeological_site" },
  { slug: "historic-bridge", label: "Old bridge", icon: "🌉", group: "history", weight: 0.85, match: (t) => t.historic === "bridge" },
  { slug: "lighthouse", label: "Lighthouse", icon: "🗼", group: "structure", weight: 1, match: (t) => t.man_made === "lighthouse" },
  { slug: "mill", label: "Windmill / watermill", icon: "🌬️", group: "structure", weight: 0.9,
    match: (t) => t.man_made === "windmill" || t.man_made === "watermill" },
  { slug: "bridge", label: "Bridge", icon: "🌉", group: "structure", weight: 0.55, match: (t) => t.man_made === "bridge" },
  { slug: "mural", label: "Mural / street art", icon: "🎨", group: "art", weight: 0.7,
    match: (t) => t.tourism === "artwork" && /^(mural|graffiti|installation)$/.test(t.artwork_type ?? "") },
  { slug: "sculpture", label: "Sculpture", icon: "🗿", group: "art", weight: 0.5,
    match: (t) => t.tourism === "artwork" && /^(statue|sculpture)$/.test(t.artwork_type ?? "") },
  { slug: "attraction", label: "Attraction", icon: "⭐", group: "view", weight: 0.5, match: (t) => t.tourism === "attraction" },
];

export const SPOT_GROUPS: Record<SpotGroup, { label: string; icon: string }> = {
  view: { label: "Views", icon: "🔭" },
  water: { label: "Water", icon: "💦" },
  rock: { label: "Rocks & nature", icon: "⛰️" },
  history: { label: "Castles & ruins", icon: "🏰" },
  urbex: { label: "Lost places", icon: "🏚️" },
  structure: { label: "Lighthouses & mills", icon: "🌬️" },
  art: { label: "Street art", icon: "🎨" },
};

export function classifySpot(t: Tags): SpotKind | null {
  for (const rule of RULES) {
    if (rule.match(t)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { match, ...kind } = rule;
      return kind;
    }
  }
  return null;
}

export interface Spot {
  id: string;
  name: string;
  named: boolean;
  kind: string;
  kindLabel: string;
  icon: string;
  group: SpotGroup;
  lat: number;
  lng: number;
  image?: string;
  wikidata?: string;
  wikipedia?: string;
  /** Wikimedia sitelinks — 0 means nobody has written it up anywhere. */
  fame: number;
  fameLabel: "hidden" | "known" | "popular" | "famous";
  gemScore: number;
  facts: string[];
  /** Route mode: km from the start along the route, and detour off it. */
  alongKm?: number;
  offRouteKm?: number;
  /** Area mode: distance from the area's center (for "nearest first"). */
  distance?: number;
}

export function fameLabel(fame: number): Spot["fameLabel"] {
  if (fame >= 25) return "famous";
  if (fame >= 8) return "popular";
  if (fame >= 3) return "known";
  return "hidden";
}

/** The bit that makes Scout different from a top-10 list. */
export function gemScore(weight: number, fame: number, documented: boolean, named: boolean): number {
  const obscurity = fame === 0 ? 1 : fame <= 2 ? 0.95 : fame <= 5 ? 0.85 : fame <= 15 ? 0.6 : fame <= 40 ? 0.35 : 0.2;
  // A named, written-about-somewhere place is more likely to be real and
  // reachable than an anonymous dot; but don't let documentation alone win.
  const quality = 0.6 + (named ? 0.2 : 0) + (documented ? 0.2 : 0);
  return Math.round(weight * obscurity * quality * 1000) / 1000;
}

function spotFacts(t: Tags): string[] {
  const f: string[] = [];
  if (t.ele) f.push(`${t.ele.replace(/\s*m$/, "")} m altitude`);
  if (t.height) f.push(`${t.height.replace(/\s*m$/, "")} m high`);
  if (t.direction && t.tourism === "viewpoint") f.push(`Faces ${t.direction}`);
  if (t.fee === "yes") f.push("Entry fee");
  if (t.fee === "no") f.push("Free");
  if (t.access && t.access !== "yes") f.push(`Access: ${t.access}`);
  if (t.opening_hours) f.push(`Hours: ${t.opening_hours}`);
  if (t.start_date) f.push(`Built ${t.start_date}`);
  if (t.description) f.push(t.description.slice(0, 140));
  if (t.artist_name) f.push(`By ${t.artist_name}`);
  return f;
}

function spotImage(t: Tags): string | undefined {
  const commons = t.wikimedia_commons;
  if (commons?.startsWith("File:")) return commonsThumb(commons, 480);
  if (t.image?.startsWith("https://upload.wikimedia.org/")) return t.image;
  if (t.image?.startsWith("File:")) return commonsThumb(t.image, 480);
  return undefined;
}

export type SpotArea = { type: "bbox"; bbox: BBox } | { type: "corridor"; line: LatLng[]; widthM: number };

export function buildSpotsQuery(area: SpotArea): string {
  const header =
    area.type === "bbox"
      ? `[out:json][timeout:40][bbox:${area.bbox.join(",")}];`
      : `[out:json][timeout:60];`;
  const f =
    area.type === "bbox"
      ? ""
      : `(around:${Math.round(area.widthM)},${area.line.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(",")})`;
  return `${header}
(
  nwr["tourism"="viewpoint"]${f};
  nwr["man_made"="tower"]["tower:type"="observation"]${f};
  nwr["waterway"="waterfall"]${f};
  nwr["natural"~"^(waterfall|hot_spring|geyser|arch|gorge|canyon|cave_entrance|glacier|dune|volcano|crater|sinkhole)$"]${f};
  nwr["natural"~"^(cliff|rock|stone|spring|peak|valley|beach|bay|tree|sand)$"]["name"]${f};
  nwr["natural"="water"]["name"]["water"~"^(lake|reservoir|lagoon)$"]${f};
  nwr["leisure"~"^(swimming_area|bathing_place)$"]${f};
  nwr["historic"~"^(castle|ruins|fort|city_gate|monastery|archaeological_site|aqueduct|mine|mine_shaft|bridge)$"]${f};
  nwr["building"="ruins"]${f};
  nwr["abandoned:man_made"]${f};
  nwr["disused:man_made"]["name"]${f};
  nwr["abandoned:building"]["name"]${f};
  nwr["abandoned:amenity"]["name"]${f};
  nwr["abandoned:railway"="station"]${f};
  nwr["man_made"~"^(lighthouse|windmill|watermill|aqueduct)$"]${f};
  nwr["man_made"="bridge"]["name"]${f};
  nwr["tourism"="artwork"]["artwork_type"~"^(mural|graffiti|installation|statue|sculpture)$"]${f};
  nwr["tourism"="attraction"]${f};
);
out tags center qt;`;
}

const UNNAMED_OK = new Set(["viewpoint", "waterfall", "cave", "arch", "hot-spring", "lost-place", "ruins", "mural", "lighthouse", "mill", "swim"]);

/** Classify + dedupe raw elements. Pure — tested with fixtures. */
export function collectSpots(elements: OverpassElement[]): Array<Omit<Spot, "fame" | "fameLabel" | "gemScore">> {
  const spots: Array<Omit<Spot, "fame" | "fameLabel" | "gemScore">> = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const t = el.tags ?? {};
    if (t.access === "private" || t.access === "no") continue;
    const kind = classifySpot(t);
    if (!kind) continue;
    const named = !!t.name;
    if (!named && !UNNAMED_OK.has(kind.slug)) continue;
    const p = elementLatLng(el);
    if (!p) continue;

    // A castle mapped as both a node and its outline: one spot.
    const dedupeKey = t.wikidata ?? (named ? `${kind.slug}:${t.name.toLowerCase()}:${p.lat.toFixed(2)},${p.lng.toFixed(2)}` : `${el.type}/${el.id}`);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    spots.push({
      id: `${el.type}/${el.id}`,
      name: t["name:en"] ?? t.name ?? kind.label,
      named,
      kind: kind.slug,
      kindLabel: kind.label,
      icon: kind.icon,
      group: kind.group,
      lat: p.lat,
      lng: p.lng,
      image: spotImage(t),
      wikidata: /^Q\d+$/.test(t.wikidata ?? "") ? t.wikidata : undefined,
      wikipedia: t.wikipedia,
      facts: spotFacts(t),
    });
  }
  return spots;
}

export function scoreSpots(
  spots: Array<Omit<Spot, "fame" | "fameLabel" | "gemScore">>,
  wd: Record<string, ImageAndFame>,
): Spot[] {
  return spots.map((s) => {
    const info = s.wikidata ? wd[s.wikidata] : undefined;
    // Has a Wikipedia tag but we couldn't count sitelinks: assume "known".
    const fame = info?.sitelinks ?? (s.wikipedia ? 3 : 0);
    const image = s.image ?? info?.image;
    const documented = !!(s.wikidata || s.wikipedia || image || s.facts.length);
    const weight = RULES.find((r) => r.slug === s.kind)?.weight ?? 0.5;
    return {
      ...s,
      image,
      fame,
      fameLabel: fameLabel(fame),
      gemScore: gemScore(weight, fame, documented, s.named),
    };
  });
}

/** Simplify a route polyline to points ~every `stepM` meters (Overpass `around` gets slow with thousands). */
export function samplePolyline(line: LatLng[], stepM: number): LatLng[] {
  if (line.length <= 2) return line;
  const out: LatLng[] = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += distanceMeters(line[i - 1], line[i]);
    if (acc >= stepM) {
      out.push(line[i]);
      acc = 0;
    }
  }
  const last = line[line.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export interface SpotsResult {
  spots: Spot[];
  truncated: boolean;
  warnings: string[];
}

export async function runSpots(area: SpotArea, center?: LatLng): Promise<SpotsResult> {
  const warnings: string[] = [];
  const elements = await overpassQuery(buildSpotsQuery(area), {
    timeoutMs: area.type === "corridor" ? 55000 : 35000,
    totalBudgetMs: 58000,
  });
  const collected = collectSpots(elements);

  let wd: Record<string, ImageAndFame> = {};
  try {
    wd = await wikidataImagesAndFame(collected.map((s) => s.wikidata).filter((q): q is string => !!q));
  } catch (err) {
    warnings.push(`Wikidata unavailable (fame scores are estimates): ${err instanceof Error ? err.message : String(err)}`);
  }

  let spots = scoreSpots(collected, wd);
  if (area.type === "corridor") {
    spots = spots.map((s) => {
      const n = nearestOnPolyline(s, area.line);
      return { ...s, alongKm: Math.round(n.alongMeters / 100) / 10, offRouteKm: Math.round(n.distance / 100) / 10 };
    });
  } else if (center) {
    spots = spots.map((s) => ({ ...s, distance: Math.round(distanceMeters(center, s)) }));
  }

  spots.sort((a, b) => b.gemScore - a.gemScore);
  const LIMIT = 250;
  return { spots: spots.slice(0, LIMIT), truncated: spots.length > LIMIT, warnings };
}
