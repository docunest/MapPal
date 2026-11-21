// First versions of every brief layer. Seeded once into mappal_rule /
// mappal_rule_version; after that the database is the source of truth
// (edited on /review → Config or by an agent with update_rule).
import type { Profile, UseCaseNode } from "./profile";

export const CHARTER = `You are checking places for one family (two adults, teenagers, a 6-year-old and a dog) who live in a camper van in Spain and Portugal and move every few days.
Rules:
1. Judge only the places listed under "Places to judge". Never return a place from "Known places" — those are done.
2. Use the facts given (OpenStreetMap, Wikipedia, Commons, Google, the place's website). Say which source a judgement rests on in "evidence". Never invent facts, hours, prices or photos.
3. verdict: "real" (it exists and works as described), "stale" (probably closed, moved or abandoned), "fake" (not what the map says it is). confidence 0–1 is how sure you are.
4. keep = the family would want this on their list (see the use-case rules). relevant = it matches the use case at all.
5. Summaries in your own words, one or two sentences. Don't copy review text.
6. Your output is AI output and is shown as such. Be plain about doubt.
7. Spend little: fetch a page or an image only when it changes a verdict or adds a menu/price for a place you keep. The server counts everything and stops you at the caps ("CAP HIT") — then stop and submit what you have.
8. Send nothing about the family (location history, names) to any website.`;

export const OUTPUT_FORMAT = `Return results with submit_results(brief_id, results), one object per place you judged:
{ "candidate": "c3",                      // the id shown in the brief
  "verdict": "real" | "stale" | "fake",
  "confidence": 0.0–1.0,
  "relevant": true|false,
  "keep": true|false,
  "score": 0–100,                         // 0 = no-go, 50 = undecided, 100 = a must — against the like/dislike hints (layer 6)
  "summary": "≤ 400 characters, own words",
  "complications": [ { "flag": "inside_shop_or_mall|car_free_zone|no_camper_parking|narrow_or_steep_access|height_or_weight_limit|no_dogs|not_child_friendly|seasonal|limited_hours|reservation_needed|private_or_members|fee|safety|other",
                       "severity": "minor|major|blocker", "note": "what and where you saw it" } ],   // [] when none; only with evidence
    // e.g. a restaurant inside a supermarket (harder to reach), in an old town closed to cars, a place that doesn't allow dogs
  "evidence": [ { "kind": "osm|google|web|photo|wikipedia|reviews|other", "url": "optional", "note": "what it showed" } ],   // ≤ 8
  // food places (cafes, bars, restaurants, fast food), when known:
  "vibe": "bar-style|hipster|local-family|fancy|workers-pub|touristy|other", "vibe_confidence": 0–1,
  "availability": { "kitchen_hours": "...", "peak_times": "...", "risks": [ { "flag": "...", "note": "..." } ] },
  "food_tags": ["pizza", "tapas"], "price_samples": [ { "item": "...", "price": 9.5, "size": "...", "currency": "EUR", "seen": "where" } ],
  // exploration, when known:
  "access": "open|restricted|closed|unknown", "how_to_get_there": "...", "parking": "...", "safety_notes": "..." }
At most 20 per call. The server checks this format (code: lib/agent/domain/review.ts); editing this text doesn't change what it accepts.`;

// Food is a group: it runs no brief itself, it gives its children the area
// (the town circles), the shared drop/score rules and the shared text.
export const FOOD: UseCaseNode = {
  useCase: "food",
  title: "Food",
  layers: ["food"],
  area: { kind: "towns" },
  select: [],
  drop: [
    { noName: true, reason: "no name on the map" },
    { match: { opening_hours: ["closed", "off"] }, reason: "marked closed on the map" },
    { hasAny: ["disused:amenity", "abandoned:amenity", "was:amenity"], reason: "marked closed on the map" },
    // Learned in a test pull (run_20261121_205093ed): Lumen in Óbidos was a hotel's restaurant.
    { regex: { keys: ["website", "contact:website"], pattern: "hotel" }, reason: "hotel restaurant (its website is a hotel's)" },
  ],
  score: [
    { hasAny: ["opening_hours"], points: 1, label: "hours mapped" },
    { hasAny: ["website", "contact:website", "phone", "contact:phone", "contact:facebook", "contact:instagram"], points: 1, label: "contact mapped" },
    { match: { outdoor_seating: "yes" }, points: 0.5, label: "terrace" },
  ],
  distancePenaltyPerKm: 0,
  townEdgePenalty: true,
  dedupeByNameWithinM: 0,
  parkingWithinM: 0,
  spreadByTown: true,
  pageSize: 25,
  criteria:
    "Places to eat and drink in and around the towns near the stop. Note kitchen hours (Spanish kitchens close between lunch and dinner), busy times and risks (seasonal closure, closed day). Menu and prices (e.g. cheapest non-margherita pizza with size, typical mains) only for places you keep.",
};

const CHAIN = { hasAny: ["brand", "brand:wikidata"], reason: "chain ({brand})" };
const NOT_LOCAL = { regex: { keys: ["name"], pattern: "\\b(casino|discoteca|disco|night ?club|hotel|resort|catering)\\b" }, reason: "hotel/club/catering, not a local place" };
const FANCY = [
  { regex: { keys: ["name", "cuisine", "description"], pattern: "\\b(gourmet|gastron[oó]mico|fine dining|michelin|haute|degustaci[oó]n|degusta[cç][aã]o)\\b" }, reason: "fancy (name/tags say fine dining)" },
  { hasAny: ["stars"], reason: "fancy (stars)" },
];

export const CAFES: UseCaseNode = {
  useCase: "cafes",
  title: "Cafes",
  parent: "food",
  idPrefix: "c",
  select: [
    { kind: "cafe", match: { amenity: "cafe" }, points: 2 },
    { kind: "ice_cream", match: { amenity: "ice_cream" }, points: 1 },
  ],
  drop: [CHAIN, NOT_LOCAL, ...FANCY],
  score: [{ regex: { keys: ["cuisine", "name"], pattern: "\\b(cake|pastry|pastelaria|confeitaria|pasteler[ií]a|bakery|panader[ií]a|padaria|coffee_shop|specialty)\\b" }, points: 1, label: "cakes / good coffee" }],
  criteria: "Want: genuinely local cafés, pastelarias and cafeterías families go to — good coffee, cakes, a terrace. Avoid: chains, hotel cafés.",
};

export const BARS: UseCaseNode = {
  useCase: "bars",
  title: "Cool bars",
  parent: "food",
  idPrefix: "b",
  select: [
    { kind: "bar", match: { amenity: "bar" }, points: 2 },
    { kind: "pub", match: { amenity: "pub" }, points: 1 },
    { kind: "biergarten", match: { amenity: "biergarten" }, points: 1 },
  ],
  drop: [CHAIN, NOT_LOCAL, ...FANCY],
  score: [
    { regex: { keys: ["name", "description", "cuisine", "drink:craft_beer", "microbrewery"], pattern: "\\b(craft|cervecer[ií]a artesana|cerveja artesanal|yes|tapas|petiscos|vermut|vermute)\\b" }, points: 1, label: "craft beer / tapas" },
    { match: { live_music: "yes" }, points: 0.5, label: "live music" },
  ],
  criteria: "Want: bar-style places, small hipster-style bars, tapas and petiscos bars with a good vibe where a family with kids and a dog is welcome (terraces). Avoid: very local workers' pubs where people drink after shifts; night clubs; chains.",
};

export const RESTAURANTS: UseCaseNode = {
  useCase: "restaurants",
  title: "Restaurants",
  parent: "food",
  idPrefix: "r",
  select: [{ kind: "restaurant", match: { amenity: "restaurant" }, points: 1 }],
  drop: [CHAIN, NOT_LOCAL, ...FANCY],
  score: [{ regex: { keys: ["cuisine"], pattern: "\\b(regional|spanish|portuguese|tapas|seafood|fish|asturian|galician|basque|catalan|local|grill|petiscos)\\b" }, points: 1, label: "local cuisine" }],
  criteria: "Want: honest local food at normal prices — menú del día, tascas, marisquerías, churrasqueiras. Avoid: fancy / fine dining, tourist traps with photo menus, chains.",
};

export const FAST_FOOD: UseCaseNode = {
  useCase: "fast-food",
  title: "Fast food",
  parent: "food",
  idPrefix: "f",
  select: [{ kind: "fast_food", match: { amenity: "fast_food" }, points: 1 }],
  drop: [],
  score: [
    { match: { drive_through: "yes" }, points: 0.5, label: "drive-through" },
    { regex: { keys: ["cuisine"], pattern: "\\b(kebab|pizza|burger|chicken|sandwich|bocadillo|frango)\\b" }, points: 0.5, label: "kebab / pizza / burger" },
  ],
  criteria: "Quick, cheap, reliable food on travel days — kebab, pizza, burgers, frango no churrasco, bocadillos. Chains are fine here. Note late opening hours and whether a camper can park nearby.",
};

const kind = (k: string, points: number, c: Omit<Profile["select"][number], "kind" | "points">) => ({ kind: k, points, ...c });

export const EXPLORATION: Profile = {
  useCase: "exploration",
  title: "Exploration and adventure",
  idPrefix: "e",
  layers: ["explore"],
  area: { kind: "radius", km: 15 },
  select: [
    kind("cave", 3, { match: { natural: "cave_entrance" } }),
    kind("mine", 3, { match: { man_made: ["adit", "mineshaft", "headframe"] } }),
    kind("mine", 3, { match: { historic: ["mine", "mine_shaft"] } }),
    kind("hot spring", 3, { match: { natural: "hot_spring" } }),
    kind("gorge", 3, { match: { natural: ["gorge", "canyon"] } }),
    kind("abandoned railway tunnel", 2.5, { match: { railway: ["abandoned", "disused"], tunnel: "yes" } }),
    kind("waterfall", 2.5, { match: { waterway: "waterfall" } }),
    kind("abandoned building", 2.5, { hasAny: ["abandoned:building", "abandoned:man_made", "abandoned:railway"] }),
    kind("abandoned building", 2.5, { match: { ruins: "yes" } }),
    kind("abandoned building", 2.5, { match: { building: "ruins" } }),
    kind("ruins", 2, { match: { historic: "ruins" } }),
    kind("sinkhole", 2, { match: { natural: "sinkhole" } }),
    kind("rock arch", 2, { match: { natural: "arch" } }),
    kind("castle", 1.5, { match: { historic: "castle" } }),
    kind("old tower", 1.5, { match: { historic: "tower" } }),
    kind("aqueduct", 1.5, { match: { historic: "aqueduct" } }),
    kind("disused quarry", 1.5, { match: { landuse: "quarry" } }),
    kind("viewpoint", 1.5, { match: { tourism: "viewpoint" } }),
    kind("gorge or valley", 1.5, { match: { natural: "valley" } }),
    kind("mountain peak", 1, { match: { natural: "peak" } }),
    kind("famous hiking trail", 2, { match: { route: "hiking" } }),
    kind("cliff", 1, { match: { natural: "cliff" } }),
  ],
  drop: [
    { noName: true, missingAll: ["wikidata", "wikipedia"], notKinds: ["cave", "mine"], reason: "no name on the map" },
    { match: { access: ["private", "no"] }, reason: "access={access} on the map" },
    { kinds: ["famous hiking trail"], match: { network: ["iwn", "nwn"] }, reason: "long-distance trail, not a spot" },
    { kinds: ["famous hiking trail"], regex: { keys: ["name"], pattern: "\\b(european|long distance|E-?\\d+|GR[ -]?\\d+)\\b" }, reason: "long-distance trail, not a spot" },
    { kinds: ["cave"], noName: true, missingAll: ["wikidata", "wikipedia", "description"], reason: "unnamed cave entrance with no description (often a pothole)" },
  ],
  score: [
    { hasAny: ["wikidata", "wikipedia"], points: 2, label: "Wikipedia/Wikidata" },
    { hasAny: ["name"], points: 1 },
    { hasAny: ["image", "wikimedia_commons"], points: 0.5, label: "photo linked" },
    { hasAny: ["description"], points: 0.5, label: "description" },
  ],
  distancePenaltyPerKm: 0.1,
  townEdgePenalty: false,
  // Long features (aqueducts, gorges, trails) are mapped as several pieces with the same name.
  dedupeByNameWithinM: 1500,
  parkingWithinM: 3000,
  spreadByTown: false,
  pageSize: 15,
  criteria:
    "Want: caves, mines, abandoned buildings, gorges, waterfalls and other spots that make a real adventure or great photos — hidden ones over famous ones. Check it still exists and is reachable (recent photos, posts, reviews), whether access is open or restricted (private, gated, closed to tourists), where to leave a camper, and safety or legal notes. Drop islands without a road and anything that needs a boat.",
};

/**
 * Code defaults. A rule nobody has changed (its current version is by
 * "default") moves to a newer default automatically, as a new version with
 * DEFAULTS_NOTE; a rule a person or an agent edited is left alone.
 * Parents come before their children.
 */
export const DEFAULTS_NOTE = "defaults updated in the code: use cases nest (Food → Cafes, Cool bars, Restaurants, Fast food); answers carry a 0–100 score against the like/dislike hints and complication flags (in a supermarket, car-free old town, no dogs…)";

const uc = (n: UseCaseNode) => ({ slug: `usecase:${n.useCase}`, layer: "usecase" as const, title: n.title, body: n.criteria ?? "", config: n });

export const DEFAULT_RULES: Array<{ slug: string; layer: "charter" | "format" | "usecase"; title: string; body: string; config?: UseCaseNode }> = [
  { slug: "charter", layer: "charter", title: "Charter (master rules)", body: CHARTER },
  { slug: "output-format", layer: "format", title: "Output format", body: OUTPUT_FORMAT },
  uc(FOOD),
  uc(CAFES),
  uc(BARS),
  uc(RESTAURANTS),
  uc(FAST_FOOD),
  uc(EXPLORATION),
];
