// What-am-I-looking-at classification for Lens. Each rule maps OSM tags (or,
// for Wikipedia-only hits, the Wikidata English description) to a kind with:
//   visibleM — roughly how far away you could plausibly see/notice it. A
//              steelworks or a peak is visible from 3 km; a memorial plaque
//              from a few hundred meters. Beyond this, Lens doesn't suggest it.
//   weight   — how interesting it is to a curious kid in the back seat
//              (industry, rails, gorges, castles high; churches, memorials low).

export type LensGroup = "industry" | "rail" | "nature" | "water" | "history" | "structure" | "culture" | "place";

export interface LensKind {
  slug: string;
  label: string;
  icon: string;
  group: LensGroup;
  visibleM: number;
  weight: number;
  /** English concept article for the "about X in general" deep-dive fallback. */
  concept?: string;
}

type Tags = Record<string, string>;

interface TagRule extends LensKind {
  match: (t: Tags) => boolean;
}

const has = (t: Tags, k: string, re: RegExp) => t[k] !== undefined && re.test(t[k]);
const isDisused = (t: Tags) =>
  Object.keys(t).some((k) => /^(disused|abandoned|ruins):/.test(k)) || t.ruins === "yes" || t.abandoned === "yes";

const TAG_RULES: TagRule[] = [
  // --- industry ---
  { slug: "power-plant", label: "Power station", icon: "⚡", group: "industry", visibleM: 3000, weight: 1, concept: "Power station",
    match: (t) => t.power === "plant" || (t.power === "generator" && !!t.name && t["generator:source"] !== "wind" && t["generator:source"] !== "solar") },
  { slug: "steelworks", label: "Steelworks", icon: "🏭", group: "industry", visibleM: 3000, weight: 1.1, concept: "Steel mill",
    match: (t) => (t.man_made === "works" || t.landuse === "industrial" || !!t.industrial) &&
      /steel|iron|ocel|železár|hut[ěi]|acer[ií]a|siderur|stahl|hütte|huta|plieno/i.test(`${t.name ?? ""} ${t.product ?? ""} ${t.industrial ?? ""}`) },
  { slug: "brewery", label: "Brewery", icon: "🍺", group: "industry", visibleM: 1500, weight: 0.9, concept: "Brewery",
    match: (t) => t.craft === "brewery" || t.industrial === "brewery" || has(t, "product", /beer|pivo/i) },
  { slug: "mine", label: "Mine", icon: "⛏️", group: "industry", visibleM: 2000, weight: 1, concept: "Mining",
    match: (t) => ["mineshaft", "adit", "headframe"].includes(t.man_made) || t.historic === "mine" || t.historic === "mine_shaft" || t.landuse === "mine" || t.industrial === "mine" },
  { slug: "quarry", label: "Quarry", icon: "🪨", group: "industry", visibleM: 3000, weight: 0.9, concept: "Quarry",
    match: (t) => t.landuse === "quarry" },
  { slug: "gasholder", label: "Gas holder", icon: "🛢️", group: "industry", visibleM: 2000, weight: 0.9, concept: "Gas holder",
    match: (t) => t.man_made === "gasometer" || t.man_made === "gasholder" },
  { slug: "factory", label: "Factory", icon: "🏭", group: "industry", visibleM: 2500, weight: 0.95, concept: "Factory",
    match: (t) => t.man_made === "works" || (!!t.industrial && !!t.name) },
  { slug: "chimney", label: "Industrial chimney", icon: "🏭", group: "industry", visibleM: 3000, weight: 0.45, concept: "Chimney",
    // Only tall or named ones — unnamed short chimneys are everywhere in industrial towns.
    match: (t) => t.man_made === "chimney" && (!!t.name || parseFloat(t.height ?? "0") >= 60) },
  { slug: "silo", label: "Silo", icon: "🌾", group: "industry", visibleM: 1500, weight: 0.5, concept: "Silo",
    match: (t) => t.man_made === "silo" && !!t.name },
  { slug: "industrial-area", label: "Industrial area", icon: "🏗️", group: "industry", visibleM: 2000, weight: 0.5, concept: "Industrial park",
    match: (t) => t.landuse === "industrial" && !!t.name },

  // --- rail ---
  { slug: "railway-station", label: "Railway station", icon: "🚉", group: "rail", visibleM: 1500, weight: 0.8, concept: "Train station",
    match: (t) => (t.railway === "station" || t.railway === "halt") && t.station !== "subway" },
  { slug: "railway-line", label: "Railway line", icon: "🛤️", group: "rail", visibleM: 1500, weight: 0.85, concept: "Railway line",
    match: (t) => t.route === "railway" },
  { slug: "historic-train", label: "Historic train", icon: "🚂", group: "rail", visibleM: 600, weight: 0.9, concept: "Steam locomotive",
    match: (t) => ["locomotive", "railway_car", "railway_station", "tram"].includes(t.historic) },
  { slug: "cable-car", label: "Cable car", icon: "🚡", group: "rail", visibleM: 2500, weight: 0.95, concept: "Aerial tramway",
    match: (t) => ["cable_car", "gondola", "chair_lift", "mixed_lift"].includes(t.aerialway) && !!t.name },

  // --- nature ---
  { slug: "gorge", label: "Gorge", icon: "🏞️", group: "nature", visibleM: 3000, weight: 1.1, concept: "Canyon",
    match: (t) => t.natural === "gorge" || t.natural === "canyon" || (t.natural === "valley" && /gorge|canyon|garganta|desfiladero|soutěsk|klamm|schlucht|gorges|wąwóz|kaňon/i.test(t.name ?? "")) },
  { slug: "waterfall", label: "Waterfall", icon: "💦", group: "nature", visibleM: 1500, weight: 1.1, concept: "Waterfall",
    match: (t) => t.waterway === "waterfall" || t.natural === "waterfall" },
  { slug: "peak", label: "Mountain peak", icon: "⛰️", group: "nature", visibleM: 3000, weight: 0.8, concept: "Summit",
    match: (t) => (t.natural === "peak" || t.natural === "volcano") && !!t.name },
  { slug: "glacier", label: "Glacier", icon: "🧊", group: "nature", visibleM: 3000, weight: 1.1, concept: "Glacier",
    match: (t) => t.natural === "glacier" },
  { slug: "cliff", label: "Cliff / rock", icon: "🧗", group: "nature", visibleM: 1500, weight: 0.8, concept: "Cliff",
    match: (t) => ["cliff", "rock", "stone", "arch", "ridge"].includes(t.natural) && !!t.name },
  { slug: "cave", label: "Cave", icon: "🕳️", group: "nature", visibleM: 600, weight: 1, concept: "Cave",
    match: (t) => t.natural === "cave_entrance" },
  { slug: "spring", label: "Spring", icon: "💧", group: "nature", visibleM: 400, weight: 0.5, concept: "Spring (hydrology)",
    match: (t) => (t.natural === "spring" || t.natural === "hot_spring") && !!t.name },
  { slug: "river", label: "River", icon: "🌊", group: "water", visibleM: 1500, weight: 0.7, concept: "River",
    match: (t) => t.waterway === "river" || (t.type === "waterway" && t.waterway !== "canal") },
  { slug: "canal", label: "Canal", icon: "🚤", group: "water", visibleM: 1000, weight: 0.7, concept: "Canal",
    match: (t) => t.waterway === "canal" },
  { slug: "lake", label: "Lake", icon: "🏞️", group: "water", visibleM: 2000, weight: 0.6, concept: "Lake",
    match: (t) => t.natural === "water" && /^(lake|reservoir|pond|lagoon)$/.test(t.water ?? "lake") && !!t.name },

  // --- water infrastructure ---
  { slug: "dam", label: "Dam", icon: "🧱", group: "water", visibleM: 2500, weight: 1, concept: "Dam",
    match: (t) => t.waterway === "dam" || t.man_made === "dam" },
  { slug: "weir", label: "Weir / lock", icon: "🌊", group: "water", visibleM: 800, weight: 0.7, concept: "Lock (water navigation)",
    match: (t) => t.waterway === "weir" || t.waterway === "lock_gate" || t.lock === "yes" },
  { slug: "lighthouse", label: "Lighthouse", icon: "🗼", group: "structure", visibleM: 3000, weight: 1, concept: "Lighthouse",
    match: (t) => t.man_made === "lighthouse" },
  { slug: "mill", label: "Windmill / watermill", icon: "🌬️", group: "history", visibleM: 1500, weight: 0.9, concept: "Windmill",
    match: (t) => t.man_made === "windmill" || t.man_made === "watermill" },
  { slug: "water-tower", label: "Water tower", icon: "🗼", group: "structure", visibleM: 2000, weight: 0.6, concept: "Water tower",
    match: (t) => t.man_made === "water_tower" },

  // --- structures ---
  { slug: "bridge", label: "Bridge", icon: "🌉", group: "structure", visibleM: 2000, weight: 0.85, concept: "Bridge",
    match: (t) => t.man_made === "bridge" && !!(t.name || t.wikidata || t.wikipedia) },
  { slug: "viewing-tower", label: "Lookout tower", icon: "🗼", group: "structure", visibleM: 2500, weight: 0.9, concept: "Observation tower",
    match: (t) => t.man_made === "tower" && (t["tower:type"] === "observation" || t.tourism === "viewpoint") },
  { slug: "tv-tower", label: "TV / radio tower", icon: "📡", group: "structure", visibleM: 3000, weight: 0.7, concept: "Radio masts and towers",
    match: (t) => (t.man_made === "tower" || t.man_made === "mast") && t["tower:type"] === "communication" && (!!t.name || parseFloat(t.height ?? "0") >= 80) },
  { slug: "tower", label: "Tower", icon: "🗼", group: "structure", visibleM: 2000, weight: 0.6, concept: "Tower",
    match: (t) => t.man_made === "tower" && !!t.name },
  { slug: "airport", label: "Airfield", icon: "✈️", group: "structure", visibleM: 3000, weight: 0.7, concept: "Airport",
    match: (t) => t.aeroway === "aerodrome" && !!t.name },
  { slug: "stadium", label: "Stadium", icon: "🏟️", group: "structure", visibleM: 1500, weight: 0.5, concept: "Stadium",
    match: (t) => t.leisure === "stadium" && !!t.name },

  // --- history ---
  { slug: "castle", label: "Castle", icon: "🏰", group: "history", visibleM: 3000, weight: 1, concept: "Castle",
    match: (t) => t.historic === "castle" || t.building === "castle" || (t.historic === "manor" && !!t.name) },
  { slug: "ruins", label: "Ruins", icon: "🏚️", group: "history", visibleM: 1500, weight: 0.95, concept: "Ruins",
    match: (t) => t.historic === "ruins" || (isDisused(t) && !!t.name && !!(t.historic || t["abandoned:man_made"] || t["disused:man_made"])) },
  { slug: "fort", label: "Fort", icon: "🛡️", group: "history", visibleM: 2000, weight: 0.95, concept: "Fortification",
    match: (t) => ["fort", "citywalls", "city_gate", "bunker", "battlefield"].includes(t.historic) || t.military === "bunker" },
  { slug: "archaeology", label: "Archaeological site", icon: "🏺", group: "history", visibleM: 800, weight: 0.8, concept: "Archaeological site",
    match: (t) => t.historic === "archaeological_site" },
  { slug: "monastery", label: "Monastery", icon: "⛪", group: "history", visibleM: 2000, weight: 0.7, concept: "Monastery",
    match: (t) => t.historic === "monastery" || t.amenity === "monastery" },
  { slug: "monument", label: "Monument", icon: "🗿", group: "history", visibleM: 800, weight: 0.55, concept: "Monument",
    match: (t) => t.historic === "monument" },
  { slug: "historic", label: "Historic site", icon: "📜", group: "history", visibleM: 800, weight: 0.6,
    match: (t) => !!t.historic && !["memorial", "wayside_cross", "wayside_shrine", "boundary_stone", "milestone", "tomb", "grave", "yes"].includes(t.historic) },
  { slug: "memorial", label: "Memorial", icon: "🕯️", group: "history", visibleM: 300, weight: 0.25,
    match: (t) => t.historic === "memorial" && !!t.name },

  // --- culture ---
  { slug: "fish-market", label: "Fish market", icon: "🐟", group: "culture", visibleM: 800, weight: 0.9, concept: "Fish market",
    match: (t) => (t.amenity === "marketplace" && /fish|ryb|pesca|pescado|peix|poisson|fisch|ryby|žuv/i.test(`${t.name ?? ""} ${t.market ?? ""}`)) || t.shop === "seafood" && /market|mercado|lonja|halle/i.test(t.name ?? "") },
  { slug: "market", label: "Market", icon: "🧺", group: "culture", visibleM: 800, weight: 0.7, concept: "Marketplace",
    match: (t) => t.amenity === "marketplace" },
  { slug: "museum", label: "Museum", icon: "🏛️", group: "culture", visibleM: 800, weight: 0.65, concept: "Museum",
    match: (t) => t.tourism === "museum" },
  { slug: "zoo", label: "Zoo / aquarium", icon: "🦁", group: "culture", visibleM: 1200, weight: 0.7, concept: "Zoo",
    match: (t) => t.tourism === "zoo" || t.tourism === "aquarium" },
  { slug: "viewpoint", label: "Viewpoint", icon: "🔭", group: "nature", visibleM: 800, weight: 0.6, concept: "Scenic viewpoint",
    match: (t) => t.tourism === "viewpoint" && !!t.name },
  { slug: "church", label: "Church", icon: "⛪", group: "culture", visibleM: 1500, weight: 0.4, concept: "Church (building)",
    match: (t) => t.amenity === "place_of_worship" || ["church", "cathedral", "chapel", "mosque", "synagogue", "temple"].includes(t.building) },
  { slug: "attraction", label: "Attraction", icon: "⭐", group: "culture", visibleM: 1000, weight: 0.6,
    match: (t) => t.tourism === "attraction" || t.tourism === "theme_park" },
  { slug: "artwork", label: "Artwork", icon: "🎨", group: "culture", visibleM: 300, weight: 0.3,
    match: (t) => t.tourism === "artwork" && !!t.name },
  { slug: "theatre", label: "Theatre", icon: "🎭", group: "culture", visibleM: 600, weight: 0.35,
    match: (t) => t.amenity === "theatre" || t.amenity === "concert_hall" },
];

// Things a wikidata/wikipedia tag drags in that aren't something you can
// look at: route relations (center can be 100 km away), boundaries, etc.
export function isLensNoise(t: Tags, osmType: string): boolean {
  if (t.boundary || t.type === "boundary" || t.type === "multipolygon" && t.boundary) return true;
  if (t.type === "route" && t.route !== "railway") return true;
  if (t.route && t.route !== "railway") return true;
  if (t.highway && !t.man_made && !t.historic && !t.bridge) return true;
  if (/^(school|university|college|kindergarten|hospital|clinic|police|townhall|bank|pharmacy|parking|fuel)$/.test(t.amenity ?? "")) return true;
  if (t.shop || t.office || t.public_transport === "platform") return true;
  if (osmType === "relation" && t.type === "public_transport") return true;
  if (t.place) return true; // handled separately as "you're in"
  return false;
}

export function classifyTags(t: Tags): LensKind | null {
  for (const rule of TAG_RULES) {
    if (rule.match(t)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { match, ...kind } = rule;
      return kind;
    }
  }
  return null;
}

export const GENERIC_LANDMARK: LensKind = {
  slug: "landmark",
  label: "Landmark",
  icon: "📍",
  group: "culture",
  visibleM: 1000,
  weight: 0.5,
};

// Wikipedia-only hits (no matching OSM feature) are classified from their
// Wikidata English description, e.g. "coal mine in Ostrava".
const TEXT_RULES: Array<[RegExp, string]> = [
  // Museums/zoos first: "railway museum" is a museum, not a railway line.
  [/\bmuseum\b/i, "museum"],
  [/\b(zoo|aquarium)\b/i, "zoo"],
  [/\b(steel ?works|steel mill|ironworks|steel plant|blast furnace)\b/i, "steelworks"],
  [/\b(steel|iron)(making)? (company|producer|manufacturer|maker)\b/i, "steelworks"],
  [/\bpower (station|plant)\b|\bhydroelectric\b/i, "power-plant"],
  [/\b(brewery|brewing company)\b/i, "brewery"],
  [/\b(mine|colliery|mineshaft)\b|\b(coal|mining) company\b/i, "mine"],
  [/\bquarry\b/i, "quarry"],
  [/\b(gasometer|gas holder)\b/i, "gasholder"],
  [/\b(factory|plant|works|mill|refinery)\b|industrial heritage|manufactur|\b(chemical|glass|car|automobile) (company|manufacturer|maker)\b/i, "factory"],
  [/\b(railway station|train station|railway halt)\b/i, "railway-station"],
  [/\b(railway line|rail line)\b|\brailway\b/i, "railway-line"],
  [/\b(viaduct|bridge)\b/i, "bridge"],
  [/\b(gorge|canyon|ravine)\b/i, "gorge"],
  [/\bwaterfall\b/i, "waterfall"],
  [/\b(mountain|peak|summit|hill)\b/i, "peak"],
  [/\bcave\b/i, "cave"],
  [/\b(river|stream|creek)\b/i, "river"],
  [/\bcanal\b/i, "canal"],
  [/\b(lake|reservoir)\b/i, "lake"],
  [/\bdam\b/i, "dam"],
  [/\blighthouse\b/i, "lighthouse"],
  [/\b(windmill|watermill)\b/i, "mill"],
  [/\b(castle|chateau|château|palace|manor)\b/i, "castle"],
  [/\b(ruin|ruins)\b/i, "ruins"],
  [/\b(fort|fortress|bunker|citadel)\b/i, "fort"],
  [/\barchaeological\b/i, "archaeology"],
  [/\b(monastery|abbey|convent)\b/i, "monastery"],
  [/\b(tower|mast)\b/i, "tower"],
  [/\b(airport|airfield)\b/i, "airport"],
  [/\bstadium\b/i, "stadium"],
  [/\bfish market\b/i, "fish-market"],
  [/\bmarket\b/i, "market"],
  [/\b(church|cathedral|chapel|basilica|synagogue|mosque)\b/i, "church"],
  [/\b(theatre|theater|opera house|concert hall)\b/i, "theatre"],
  [/\b(monument|statue|sculpture)\b/i, "monument"],
];

// Geosearch returns every geotagged article; these aren't things a kid can
// see out of the window.
const TEXT_EXCLUDE =
  /\b(school|university|college|faculty|gymnasium|kindergarten|street|road in|square in|diocese|parish|metropolitan area|urban area|cadastral|electoral|constituency|hospital|company|association|club|organi[sz]ation|team|district|municipality|borough|quarter|neighbou?rhood|municipal part|festival|event|suburb|village|town|city|region|county|province|administrative|tram stop|bus station|hotel|cemetery|office building|residential)\b/i;

const GENERIC_PHYSICAL =
  /\b(building|structure|complex|site|landmark|house|villa|palace|hall|garden|park|tunnel|pier|harbou?r|port|gate|fountain|well|cross|column|obelisk|ruin|wall|tower|arena|observatory|planetarium|lookout|heritage)\b/i;

const KIND_BY_SLUG = Object.fromEntries(TAG_RULES.map((r) => [r.slug, r]));

export function classifyDescription(description: string | undefined): LensKind | null {
  if (!description) return null;
  for (const [re, slug] of TEXT_RULES) {
    if (re.test(description)) {
      // Industrial companies are their plant, for a kid's purposes ("Czech
      // steel company" is the steelworks they're driving past).
      if (/\bcompany\b/i.test(description) && !/steel|iron|mining|brewery|glass|chemical|car|coal/i.test(description)) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { match, ...kind } = KIND_BY_SLUG[slug];
      return kind;
    }
  }
  // Anything else must at least be a physical thing you could look at —
  // geosearch also returns festivals, neighbourhoods, sports clubs…
  if (TEXT_EXCLUDE.test(description) || !GENERIC_PHYSICAL.test(description)) return null;
  return GENERIC_LANDMARK;
}

export function kindBySlug(slug: string): LensKind | undefined {
  const rule = KIND_BY_SLUG[slug];
  if (!rule) return slug === GENERIC_LANDMARK.slug ? GENERIC_LANDMARK : undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { match, ...kind } = rule;
  return kind;
}
