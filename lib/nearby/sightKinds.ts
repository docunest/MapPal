// What counts as an interesting sight, and how to tell from the data.
// Each kind has:
//   visibleM — roughly how far away you'd notice it. A steelworks or a port
//              is obvious from 3 km; a memorial plaque from a few hundred m.
//   weight   — how interesting it is to a curious kid (industry, rails,
//              ports, gorges, castles high; churches, memorials low).
//   concept/how — the general Wikipedia article and the YouTube
//              "how it works / how it's made" search for the deep dive.
//
// Classification order: OSM tags, then text (Wikipedia/Wikidata
// descriptions, names) in English, Spanish, Portuguese, Catalan, Galician —
// the local languages are where Iberian sights are actually described.

export type SightGroup = "industry" | "rail" | "port" | "nature" | "water" | "history" | "structure" | "culture";

export interface SightKind {
  slug: string;
  label: string;
  icon: string;
  group: SightGroup;
  visibleM: number;
  weight: number;
  concept?: string;
  how?: string;
}

type Tags = Record<string, string>;

const K = (
  slug: string,
  label: string,
  icon: string,
  group: SightGroup,
  visibleM: number,
  weight: number,
  concept?: string,
  how?: string,
): SightKind => ({ slug, label, icon, group, visibleM, weight, concept, how });

export const KINDS: Record<string, SightKind> = Object.fromEntries(
  [
    K("steelworks", "Steelworks", "🏭", "industry", 3000, 1.1, "Steel mill", "how steel is made"),
    K("power-plant", "Power station", "⚡", "industry", 3000, 1, "Power station", "how a power station makes electricity"),
    K("refinery", "Refinery", "🛢️", "industry", 3000, 1, "Oil refinery", "how an oil refinery works"),
    K("factory", "Factory", "🏭", "industry", 2500, 0.95, "Factory", "how a factory works"),
    K("mine", "Mine", "⛏️", "industry", 2000, 1, "Mining", "how mines work"),
    K("quarry", "Quarry", "🪨", "industry", 3000, 0.9, "Quarry", "how a quarry works"),
    K("winery", "Winery", "🍇", "industry", 1500, 0.8, "Winery", "how wine is made"),
    K("oil-mill", "Olive oil mill", "🫒", "industry", 1200, 0.9, "Olive oil extraction", "how olive oil is made"),
    K("salt-pans", "Salt pans", "🧂", "industry", 2000, 0.9, "Evaporation pond", "how sea salt is made"),
    K("brewery", "Brewery", "🍺", "industry", 1500, 0.8, "Brewery", "how beer is made"),
    K("gasholder", "Gas holder", "🛢️", "industry", 2000, 0.8, "Gas holder", "how gas holders worked"),
    K("chimney", "Industrial chimney", "🏭", "industry", 3000, 0.45, "Chimney", "why factories have tall chimneys"),
    K("industrial-area", "Industrial area", "🏗️", "industry", 2000, 0.45, "Industrial park", "how factories work"),
    K("port", "Port", "⚓", "port", 3000, 0.95, "Port", "how a container port works"),
    K("fish-market", "Fish auction / market", "🐟", "port", 1000, 1, "Fish market", "how a fish auction works"),
    K("shipyard", "Shipyard", "🚢", "port", 2500, 1, "Shipyard", "how ships are built"),
    K("crane", "Harbour crane", "🏗️", "port", 2500, 0.6, "Container crane", "how container cranes work"),
    K("lighthouse", "Lighthouse", "🗼", "port", 3000, 1, "Lighthouse", "how lighthouses work"),
    K("railway-station", "Railway station", "🚉", "rail", 1500, 0.8, "Train station", "how railway signalling works"),
    K("railway-line", "Railway line", "🛤️", "rail", 1500, 0.85, "Railway line", "how railways are built"),
    K("historic-train", "Historic train", "🚂", "rail", 600, 0.9, "Steam locomotive", "how a steam locomotive works"),
    K("cable-car", "Cable car", "🚡", "rail", 2500, 0.95, "Aerial tramway", "how cable cars work"),
    K("bridge", "Bridge", "🌉", "structure", 2000, 0.85, "Bridge", "how bridges are built"),
    K("aqueduct", "Aqueduct", "🌉", "history", 2500, 1, "Aqueduct (water supply)", "how roman aqueducts worked"),
    K("dam", "Dam", "🧱", "water", 2500, 1, "Dam", "how dams work"),
    K("weir", "Weir / lock", "🌊", "water", 800, 0.7, "Lock (water navigation)", "how canal locks work"),
    K("mill", "Windmill / watermill", "🌬️", "history", 1500, 0.9, "Watermill", "how a windmill works"),
    K("water-tower", "Water tower", "🗼", "structure", 2000, 0.6, "Water tower", "how water towers work"),
    K("tv-tower", "TV / radio tower", "📡", "structure", 3000, 0.6, "Radio masts and towers", "how TV towers work"),
    K("viewing-tower", "Lookout tower", "🗼", "structure", 2500, 0.8, "Observation tower"),
    K("tower", "Tower", "🗼", "history", 2000, 0.6, "Tower"),
    K("airport", "Airfield", "✈️", "structure", 3000, 0.7, "Airport", "how airports work"),
    K("stadium", "Stadium", "🏟️", "structure", 1500, 0.45, "Stadium"),
    K("gorge", "Gorge", "🏞️", "nature", 3000, 1.1, "Canyon", "how gorges and canyons form"),
    K("waterfall", "Waterfall", "💦", "nature", 1500, 1.1, "Waterfall", "how waterfalls form"),
    K("peak", "Mountain", "⛰️", "nature", 3000, 0.75, "Mountain", "how mountains form"),
    K("cliff", "Cliff / rock", "🧗", "nature", 1500, 0.8, "Cliff", "how cliffs and rock formations form"),
    K("cave", "Cave", "🕳️", "nature", 600, 1, "Cave", "how caves form"),
    K("spring", "Spring", "💧", "nature", 400, 0.5, "Spring (hydrology)", "where spring water comes from"),
    K("river", "River", "🌊", "water", 1500, 0.7, "River", "how rivers shape the land"),
    K("canal", "Canal", "🚤", "water", 1000, 0.7, "Canal", "how canal locks work"),
    K("lake", "Lake / reservoir", "🏞️", "water", 2000, 0.6, "Lake", "how lakes form"),
    K("castle", "Castle / palace", "🏰", "history", 3000, 1, "Castle", "how medieval castles were built"),
    K("ruins", "Ruins", "🏚️", "history", 1500, 0.95, "Ruins", "how archaeologists study ruins"),
    K("fort", "Fort / walls", "🛡️", "history", 2000, 0.95, "Fortification", "how forts defended against attacks"),
    K("archaeology", "Ancient site", "🏺", "history", 800, 0.85, "Archaeological site", "how archaeologists dig"),
    K("monastery", "Monastery", "⛪", "history", 2000, 0.7, "Monastery", "what life in a medieval monastery was like"),
    K("monument", "Monument", "🗿", "history", 800, 0.5, "Monument"),
    K("historic", "Historic site", "📜", "history", 800, 0.6),
    K("memorial", "Memorial", "🕯️", "history", 300, 0.2),
    K("market", "Market", "🧺", "culture", 800, 0.7, "Marketplace"),
    K("museum", "Museum", "🏛️", "culture", 800, 0.65, "Museum"),
    K("zoo", "Zoo / aquarium", "🐠", "culture", 1200, 0.7, "Zoo"),
    K("viewpoint", "Viewpoint", "🔭", "nature", 800, 0.55, "Scenic viewpoint"),
    K("church", "Church", "⛪", "culture", 1500, 0.4, "Church (building)"),
    K("attraction", "Attraction", "⭐", "culture", 1000, 0.55),
    K("artwork", "Artwork", "🎨", "culture", 300, 0.3, "Public art"),
    K("theatre", "Theatre", "🎭", "culture", 600, 0.35, "Theatre"),
    K("landmark", "Landmark", "📍", "culture", 1000, 0.5),
  ].map((k) => [k.slug, k]),
);

const kind = (slug: string) => KINDS[slug];

// --- 1. OSM tags --------------------------------------------------------------

const has = (t: Tags, k: string, re: RegExp) => t[k] !== undefined && re.test(t[k]);
const anyText = (t: Tags) => `${t.name ?? ""} ${t["name:es"] ?? ""} ${t["name:pt"] ?? ""} ${t.product ?? ""} ${t.industrial ?? ""}`;
const isDisused = (t: Tags) =>
  Object.keys(t).some((k) => /^(disused|abandoned|ruins):/.test(k)) || t.ruins === "yes" || t.abandoned === "yes";

// Unicode-aware whole-word match (\b doesn't understand "estación" or "à").
const words = (alternatives: string) => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, "iu");

const FISH_AUCTION = words("lonja|lota|llotja|lonxa|docapesca|fish market|mercado de pescado|mercado do peixe|mercado de peixe");
const STEEL = words("steel|iron ?works|siderúrgica|siderurgia|siderúrgico|acería|aceria|altos? hornos?|alt forn|alto-forno|altos-fornos|aço|aços|aceros?");

const TAG_RULES: Array<[string, (t: Tags) => boolean]> = [
  ["fish-market", (t) => FISH_AUCTION.test(t.name ?? "") && !t.highway && !t.public_transport && !t.amenity?.match(/^(restaurant|bar|cafe|bus_station)$/)],
  ["steelworks", (t) => t.industrial === "steelmaking" || t.industrial === "steel" || ((t.man_made === "works" || t.landuse === "industrial" || !!t.industrial) && STEEL.test(anyText(t)))],
  ["refinery", (t) => t.industrial === "refinery" || has(t, "product", /petroleum|oil|fuel/i) && t.man_made === "works"],
  ["power-plant", (t) => t.power === "plant" || (t.power === "generator" && !!t.name && !/^(wind|solar)$/.test(t["generator:source"] ?? ""))],
  ["shipyard", (t) => t.industrial === "shipyard" || t.landuse === "shipyard" || t.craft === "boatbuilder" && !!t.name],
  ["winery", (t) => t.craft === "winery" || t.industrial === "winery" || t.tourism === "wine_cellar" || t.shop === "wine" && /bodega|adega|quinta/i.test(t.name ?? "")],
  ["oil-mill", (t) => t.craft === "oil_mill" || t.industrial === "oil_mill" || /almazara|lagar(?! de vinho)|moinho de azeite|trujal/i.test(t.name ?? "") && !t.amenity],
  ["salt-pans", (t) => t.landuse === "salt_pond" || t.industrial === "salt" || /^(salinas?|salines|marinhas?)( |$)/i.test(t.name ?? "") && !!(t.landuse || t.natural || t.historic)],
  ["brewery", (t) => t.craft === "brewery" || t.industrial === "brewery"],
  ["mine", (t) => ["mineshaft", "adit", "headframe"].includes(t.man_made) || t.historic === "mine" || t.historic === "mine_shaft" || t.landuse === "mine" || t.industrial === "mine"],
  ["quarry", (t) => t.landuse === "quarry"],
  ["gasholder", (t) => t.man_made === "gasometer" || t.man_made === "gasholder"],
  ["port", (t) => (t.landuse === "harbour" || t.industrial === "port" || t.harbour === "yes" || t["seamark:type"] === "harbour") && !!t.name],
  ["crane", (t) => t.man_made === "crane" && !!t.name],
  ["factory", (t) => t.man_made === "works" || (!!t.industrial && !!t.name)],
  ["chimney", (t) => t.man_made === "chimney" && (!!t.name || parseFloat(t.height ?? "0") >= 60)],
  ["industrial-area", (t) => t.landuse === "industrial" && !!t.name],
  ["railway-station", (t) => (t.railway === "station" || t.railway === "halt") && t.station !== "subway"],
  ["railway-line", (t) => t.route === "railway"],
  ["historic-train", (t) => ["locomotive", "railway_car", "railway_station", "tram"].includes(t.historic)],
  ["cable-car", (t) => ["cable_car", "gondola", "chair_lift", "mixed_lift"].includes(t.aerialway) && !!t.name],
  ["gorge", (t) => t.natural === "gorge" || t.natural === "canyon" || (t.natural === "valley" && words("gorge|canyon|garganta|desfiladero|cañón|desfiladeiro|congost|gorja|foz").test(t.name ?? ""))],
  ["waterfall", (t) => t.waterway === "waterfall" || t.natural === "waterfall"],
  ["peak", (t) => (t.natural === "peak" || t.natural === "volcano") && !!t.name],
  ["cliff", (t) => ["cliff", "rock", "stone", "arch", "ridge"].includes(t.natural) && !!t.name],
  ["cave", (t) => t.natural === "cave_entrance"],
  ["spring", (t) => (t.natural === "spring" || t.natural === "hot_spring") && !!t.name],
  ["river", (t) => t.waterway === "river" || (t.type === "waterway" && t.waterway !== "canal")],
  ["canal", (t) => t.waterway === "canal"],
  ["lake", (t) => t.natural === "water" && /^(lake|reservoir|lagoon)$/.test(t.water ?? "lake") && !!t.name],
  ["dam", (t) => t.waterway === "dam" || t.man_made === "dam"],
  ["weir", (t) => t.waterway === "weir" || t.waterway === "lock_gate" || t.lock === "yes"],
  ["lighthouse", (t) => t.man_made === "lighthouse"],
  ["aqueduct", (t) => t.historic === "aqueduct" || t.man_made === "aqueduct" || t.bridge === "aqueduct"],
  ["mill", (t) => t.man_made === "windmill" || t.man_made === "watermill"],
  ["water-tower", (t) => t.man_made === "water_tower"],
  ["bridge", (t) => (t.man_made === "bridge" || t.historic === "bridge") && !!(t.name || t.wikidata || t.wikipedia)],
  ["viewing-tower", (t) => t.man_made === "tower" && (t["tower:type"] === "observation" || t.tourism === "viewpoint")],
  ["tv-tower", (t) => (t.man_made === "tower" || t.man_made === "mast") && t["tower:type"] === "communication" && (!!t.name || parseFloat(t.height ?? "0") >= 80)],
  ["tower", (t) => (t.man_made === "tower" || t.historic === "tower") && !!t.name],
  ["airport", (t) => t.aeroway === "aerodrome" && !!t.name],
  ["stadium", (t) => t.leisure === "stadium" && !!t.name],
  ["castle", (t) => t.historic === "castle" || t.building === "castle" || ((t.historic === "manor" || t.historic === "palace") && !!t.name)],
  ["ruins", (t) => t.historic === "ruins" || (isDisused(t) && !!t.name && !!(t.historic || t["abandoned:man_made"] || t["disused:man_made"]))],
  ["fort", (t) => ["fort", "citywalls", "city_gate", "bunker", "battlefield"].includes(t.historic) || t.military === "bunker"],
  ["archaeology", (t) => t.historic === "archaeological_site"],
  ["monastery", (t) => t.historic === "monastery" || t.amenity === "monastery"],
  ["monument", (t) => t.historic === "monument"],
  ["historic", (t) => !!t.historic && !["memorial", "wayside_cross", "wayside_shrine", "boundary_stone", "milestone", "tomb", "grave", "yes"].includes(t.historic)],
  ["memorial", (t) => t.historic === "memorial" && !!t.name],
  ["market", (t) => t.amenity === "marketplace" || (t.building === "retail" && /mercado|mercat|praza de abastos/i.test(t.name ?? ""))],
  ["museum", (t) => t.tourism === "museum"],
  ["zoo", (t) => t.tourism === "zoo" || t.tourism === "aquarium"],
  ["viewpoint", (t) => t.tourism === "viewpoint" && !!t.name],
  ["church", (t) => t.amenity === "place_of_worship" || ["church", "cathedral", "chapel", "mosque", "synagogue", "temple"].includes(t.building)],
  ["attraction", (t) => t.tourism === "attraction" || t.tourism === "theme_park"],
  ["artwork", (t) => t.tourism === "artwork" && !!t.name],
  ["theatre", (t) => t.amenity === "theatre" || t.amenity === "concert_hall"],
];

/** Things a wikidata/wikipedia tag drags in that you can't look at. */
export function isSightNoise(t: Tags, osmType: string): boolean {
  if (t.boundary || t.type === "boundary") return true;
  if ((t.type === "route" || t.route) && t.route !== "railway") return true;
  if (t.highway && !t.man_made && !t.historic && !t.bridge) return true;
  if (/^(school|university|college|kindergarten|hospital|clinic|police|townhall|bank|pharmacy|parking|fuel|restaurant|cafe|bar|fast_food|bus_station)$/.test(t.amenity ?? "")) return true;
  if (t.shop || t.public_transport === "platform" || t.place) return true;
  if (osmType === "relation" && t.type === "public_transport") return true;
  // An office is only a sight when its name says it's a fish auction (DocaPesca).
  if (t.office && !FISH_AUCTION.test(t.name ?? "")) return true;
  if (t.tourism && /^(hotel|guest_house|hostel|apartment|information|camp_site|caravan_site|picnic_site)$/.test(t.tourism)) return true;
  return false;
}

export function classifyTags(t: Tags): SightKind | null {
  for (const [slug, match] of TAG_RULES) if (match(t)) return kind(slug);
  return null;
}

// --- 2. Text (descriptions, titles, names) ------------------------------------

// Checked on descriptions first: it's a place/settlement/admin unit, a person,
// or something you can't see out of the window → not a sight, whatever its
// name says ("Puerto de Sagunto" the town is not a port).
const NOT_A_SIGHT = words(
  [
    "village|town|city|municipality|neighbou?rhood|district|borough|suburb|quarter|parish|region|county|province|metropolitan area|urban area|cadastral",
    "núcleo de población|localidad|municipio|pedanía|barrio|distrito|aldea|pueblo|ciudad|comarca|parroquia civil|entidad (?:de población|singular)",
    "freguesia|concelho|aldeia|vila|cidade|lugar|bairro|município|localidade",
    "municipi|poble|vila|barri|nucli de població|concello|parroquia|lugar",
    "school|university|college|faculty|kindergarten|colegio|escuela|instituto|universidad|escola|universidade|liceu",
    "street|road in|square in|avenue|calle|avenida|plaza|rua|praça|carrer|plaça|rúa|praza",
    "hospital|hotel|cemetery|cementerio|cemitério|cementiri|company|empresa|companhia|club|clube|team|equipo|festival|association|asociación|associação",
    "diocese|diócesis|diocese|electoral|constituency|tram stop|bus station|beach|playa|praia|platja",
  ].join("|"),
);

const TEXT_RULES: Array<[RegExp, string]> = [
  [words("museum|museo|museu|muséu"), "museum"],
  [words("zoo|aquarium|acuario|aquário|oceanario|oceanário"), "zoo"],
  [FISH_AUCTION, "fish-market"],
  [words("steel ?works|steel mill|ironworks|steel plant|blast furnace|alto horno|altos hornos|alt forn|siderúrgica|siderurgia|acería|alto-forno|altos-fornos|siderurgia nacional"), "steelworks"],
  [words("power (?:station|plant)|hydroelectric|central (?:térmica|termica|nuclear|hidroeléctrica|hidroelectrica|eléctrica|electrica|termoeléctrica|termoelétrica|termoelèctrica|hidroelétrica|de ciclo combinado|tèrmica|hidroelèctrica)|termoelétrica|termoelèctrica|cicle combinat|ciclo combinado"), "power-plant"],
  [words("refinery|refinería|refinaria|refineria"), "refinery"],
  [words("shipyard|astillero|estaleiros?|drassanes?"), "shipyard"],
  [words("winery|bodegas?|adegas?|celler|vinícola|wine cellar"), "winery"],
  [words("almazara|lagar de azeite|olive oil mill|moinho de azeite|trujal|molí d'oli"), "oil-mill"],
  [words("salt pans?|salinas|salines|marinhas de sal"), "salt-pans"],
  [words("brewery|cervecera|cervejeira|fábrica de cerveza|fábrica de cerveja"), "brewery"],
  [words("mine|colliery|mineshaft|mina|minas|pozo minero|explotación minera|mina de"), "mine"],
  [words("quarry|cantera|pedreira|pedrera|canteira"), "quarry"],
  [words("factory|plant|works|mill|fábrica|fàbrica|fabrica|planta industrial|industrial heritage|patrimonio industrial|património industrial|manufactur\\w*"), "factory"],
  // Not a bare "estação/estación": that's also research, bus and service
  // (fuel) stations. OSM-tagged stations are classified by their tags anyway.
  [words("railway station|train station|estación de (?:tren|ferrocarril|ferrocarriles)|estación ferroviaria|estação ferroviária|estação de caminho de ferro|estació de (?:tren|ferrocarril)|apeadero|apeadeiro"), "railway-station"],
  [words("railway line|rail line|línea (?:de ferrocarril|férrea)|linha (?:do|de|da)|ferrocarril|caminho de ferro|línia|ferrovia"), "railway-line"],
  [words("aqueduct|acueducto|aqueduto|aqüeducte"), "aqueduct"],
  [words("viaduct|bridge|puente|ponte|pont|viaducto|viaduto|viaducte|ponte móvel"), "bridge"],
  [words("dam|presa|embalse|barragem|pantano|encoro|embassament|albufeira"), "dam"],
  [words("gorge|canyon|ravine|garganta|desfiladero|cañón|desfiladeiro|congost|gorja|foz"), "gorge"],
  [words("waterfall|cascada|salto de agua|cascata|queda de água|queda d'água|fervenza|salt d'aigua"), "waterfall"],
  [words("cave|cueva|gruta|cova|caverna|sima"), "cave"],
  // Not Catalan "far": English descriptions say "so far".
  [words("lighthouse|faro|farol"), "lighthouse"],
  [words("windmill|watermill|molino|moinho|molí|muíño|aceña|azenha"), "mill"],
  [words("castle|chateau|château|palace|manor|castillo|castelo|castell|alcázar|alcazaba|palacio|palácio|paço|palau|pazo"), "castle"],
  [words("ruins?|ruinas|ruínas"), "ruins"],
  [words("fort|fortress|bunker|citadel|fuerte|fortaleza|forte|ciudadela|cidadela|baluarte|muralla|muralha|city walls"), "fort"],
  [words("archaeological|yacimiento|arqueológico|arqueológica|arqueológico|castro|citânia|necrópolis|necrópole|dolmen|dólmen|anta|jaciment"), "archaeology"],
  [words("monastery|abbey|convent|monasterio|mosteiro|monestir|convento|abadía|cartuja|mosteiro"), "monastery"],
  [words("harbou?r|seaport|port|port of|fishing port|porto de pesca|recinto portuario|porto marítimo|puerto pesquero|puerto comercial|dársena|terminal portuaria|container terminal|cruise terminal|ship terminal"), "port"],
  [words("river|stream|creek|río|rio|riu|arroyo|ribeira|ribera|regato"), "river"],
  [words("canal"), "canal"],
  [words("lake|reservoir|lago|laguna|lagoa|estany|llac"), "lake"],
  [words("mountain|peak|summit|hill|pico|monte|sierra|serra|cerro|puig|cumbre"), "peak"],
  [words("tower|mast|torre"), "tower"],
  [words("airport|airfield|aeropuerto|aeroporto|aeródromo"), "airport"],
  [words("stadium|estadio|estádio|estadi"), "stadium"],
  [words("market|mercado|mercat|plaza de abastos|praza de abastos"), "market"],
  [words("church|cathedral|chapel|basilica|synagogue|mosque|iglesia|igreja|església|igrexa|catedral|sé|capilla|capela|ermita|basílica|santuario|santuário|colegiata"), "church"],
  [words("theatre|theater|opera house|concert hall|teatro|teatre"), "theatre"],
  [words("monument|statue|sculpture|monumento|estatua|estátua|escultura"), "monument"],
];

// A physical thing worth a card even if no specific rule matched.
const PHYSICAL = words(
  "building|structure|complex|site|landmark|house|villa|palace|hall|garden|park|tunnel|pier|gate|fountain|well|cross|column|wall|tower|arena|observatory|heritage|swimming pool|tidal pools?|edificio|edifício|casa|palacete|jardín|jardim|túnel|fuente|fonte|puerta|porta|piscinas?|bien de interés cultural|património|patrimonio|monumento nacional",
);

/**
 * Classify a thing from text: description (any language) first, then its
 * name/title. Returns null for settlements, streets, schools, people…
 */
export function classifyText(name: string | undefined, description: string | undefined): SightKind | null {
  if (description && NOT_A_SIGHT.test(description)) {
    // …unless the description itself says what it is, e.g. "church in the
    // village of X" or "castle in the town of Y".
    const specific = TEXT_RULES.find(([re]) => re.test(description));
    if (!specific) return null;
    return kind(specific[1]);
  }
  for (const text of [description, name]) {
    if (!text) continue;
    for (const [re, slug] of TEXT_RULES) if (re.test(text)) return kind(slug);
  }
  if (description && PHYSICAL.test(description)) return kind("landmark");
  return null;
}

/**
 * Classify from everything the sources said: descriptions in any language
 * first; a description that marks it as a town/beach/school vetoes guessing
 * from the name ("Platja del Port de Sagunt" is a beach, not a port).
 */
export function classifyFromTexts(names: Array<string | undefined>, descriptions: Array<string | undefined>): SightKind | null {
  const descs = descriptions.filter((d): d is string => !!d);
  let vetoed = false;
  for (const d of descs) {
    const k = classifyText(undefined, d);
    if (k) return k;
    if (NOT_A_SIGHT.test(d)) vetoed = true;
  }
  if (vetoed) return null;
  for (const n of names) {
    const k = n ? classifyText(n, undefined) : null;
    if (k) return k;
  }
  return null;
}

export function kindBySlug(slug: string | undefined): SightKind | undefined {
  return slug ? KINDS[slug] : undefined;
}
