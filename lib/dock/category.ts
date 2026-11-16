// What a sent place IS — so the car and the phone can show ⛺ / 🛒 / ⛽ … next to
// "3 days ago · 12 km" instead of a Spanish or Portuguese address, and filter by it.
// Owner-approved 2026-11-15 (docs/DOCK.md "Place categories").
//
// 1. Rules, instantly: keywords in EN/ES/PT/CA/GL/FR/IT/DE + the big chains per
//    country, on the name first, then the address. 34 of the owner's first 38
//    located places right by rules alone.
// 2. OpenStreetMap, after answering (only when the rules found nothing): the
//    named OSM object at the pin (Overpass), else Nominatim reverse.
// The source is stored next to the category ("rules" / "osm" / "owner"):
// lookup data, never guessed by AI.

export const CATEGORIES = ["camp", "grocery", "fuel", "parking", "shopping", "eat", "services", "sight", "town", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_ICON: Record<Category, string> = {
  camp: "⛺",
  grocery: "🛒",
  fuel: "⛽",
  parking: "🅿️",
  shopping: "🛍️",
  eat: "🍴",
  services: "🔧",
  sight: "📍",
  town: "🏘️",
  other: "❔",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  camp: "Campsites",
  grocery: "Grocery",
  fuel: "Fuel",
  parking: "Parking",
  shopping: "Shopping",
  eat: "Eat & drink",
  services: "Services",
  sight: "Sights & nature",
  town: "Towns",
  other: "Other",
};

/** Lowercase, no accents, apostrophes and dashes as spaces — "Intermarché" → "intermarche". */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´\-–—_/|.,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (list: string) => list.split("|").map((w) => w.trim()).filter(Boolean);
const rx = (list: string) => new RegExp(`(?:^| )(?:${words(list).map((w) => norm(w).replace(/ /g, " ")).join("|")})(?= |$)`);

// Order matters: the first rule that matches wins (a "Parking del Camping" is a campsite,
// a "Lidl" café isn't a thing, a "Restaurante do Parque de Campismo" is the campsite's).
const RULES: Array<[Category, RegExp]> = [
  [
    "camp",
    rx(
      "camping|campings|campsite|camp site|campground|caravan park|holiday park|glamping|" +
        "parque de campismo|campismo|parque campismo|orbitur|camping municipal|" + // PT
        "area de autocaravanas|area autocaravanas|area de servicio de autocaravanas|area ac|parque de autocaravanas|autocaravanas|autocaravana|" +
        "area de caravanas|camper area|camperpark|camper park|motorhome area|aire de camping car|aire camping car|aire de services|" +
        "camping car park|campingplatz|campingpark|wohnmobilstellplatz|stellplatz|wohnmobilpark|area sosta camper|area sosta|campeggio|agricampeggio|" +
        "acampada|area de acampada|zona de acampada|parc de campismo|parque de campismo rural",
    ),
  ],
  [
    "fuel",
    rx(
      "gasolinera|estacion de servicio|estacion servicio|e s|posto de combustivel|posto de abastecimento|bomba de gasolina|area de servico|" +
        "station service|station essence|tankstelle|distributore|stazione di servizio|gas station|petrol station|fuel station|" +
        "repsol|cepsa|moeve|galp|bp|shell|prio|totalenergies|esso|avia|ballenoil|plenoil|petroprix|petronor|campsa|meroil|carrefour gasolinera|" +
        "bonarea gasolinera|alcampo gasolinera|q8|agip|tamoil|aral|omv|intermarche carburant|leclerc carburant|bp express",
    ),
  ],
  [
    "grocery",
    rx(
      "supermercado|supermercados|hipermercado|hiper|minimercado|mercearia|frutaria|talho|carniceria|fruteria|ultramarinos|" +
        "supermarche|hypermarche|epicerie|supermarkt|lebensmittel|supermercato|alimentari|grocery|groceries|supermarket|hypermarket|" +
        // ES
        "mercadona|lidl|aldi|carrefour|carrefour express|carrefour market|dia market|maxi dia|eroski|alcampo|auchan|consum|bm supermercados|gadis|froiz|" +
        "hipercor|ahorramas|bonpreu|bon preu|condis|caprabo|spar|coviran|masymas|mas y mas|alimerka|el arbol|vegalsa|supermercados lupa|" +
        "hiperdino|cash fresh|supersol|economy cash|e leclerc|leclerc|" +
        // PT
        "pingo doce|continente|continente modelo|continente bom dia|intermarche|minipreco|mini preco|meu super|amanhecer|coviran portugal|" +
        "el corte ingles supermercado|apolonia|recheio|makro|" +
        // FR / IT / DE
        "super u|hyper u|u express|monoprix|franprix|netto|intermarche super|coop|conad|esselunga|despar|eurospin|edeka|rewe|kaufland",
    ),
  ],
  [
    "parking",
    rx(
      "parking|parkings|aparcamiento|aparcamientos|aparcamento|aparcadoiro|estacionamento|parque de estacionamento|parque estacionamento|" +
        "parcheggio|parkplatz|parkhaus|tiefgarage|car park|carpark|emel|saba|empark|indigo|telpark|interparking|parking gratuito|parking libre|zona azul",
    ),
  ],
  [
    "shopping",
    rx(
      "shopping|centro comercial|mall|outlet|fashion outlet|retail park|parque comercial|galerias|galeria comercial|mercado de abastos|feira|" +
        "ikea|leroy merlin|fnac|decathlon|worten|primark|el corte ingles|media markt|mediamarkt|bricomart|bricodepot|brico depot|aki|maxmat|" +
        "conforama|zara|sportzone|sport zone|kiwoko|tiendanimal|norauto|feu vert|euronics|staples|tedi|pepco|jysk|" +
        "boulanger|darty|castorama|obi|hornbach|bauhaus|toom|mediaworld|unieuro",
    ),
  ],
  [
    "eat",
    rx(
      "restaurante|restaurant|ristorante|trattoria|osteria|brasserie|bistro|cafe|cafeteria|cafetaria|bar|pizzeria|tasca|taberna|marisqueira|" +
        "churrasqueira|asador|sidreria|meson|cervejaria|cerveceria|pastelaria|pasteleria|padaria|panaderia|confeitaria|heladeria|gelataria|" +
        "gelateria|kebab|burger|mcdonald s|mcdonalds|burger king|telepizza|kfc|tapas|pulperia|chiringuito|biergarten|gasthaus|imbiss",
    ),
  ],
  [
    "services",
    rx(
      "veterinario|veterinaria|clinica veterinaria|vet|farmacia|pharmacy|pharmacie|apotheke|lavanderia|laundry|laverie|waschsalon|lavandaria|" +
        "tattoo|piercing|oficina|taller|mecanico|pneus|neumaticos|reifen|garage|car wash|lavagem|lavado|hospital|centro de saude|centro de salud|" +
        "clinica|dentista|correos|ctt|post office|banco|bank|cabeleireiro|peluqueria|ferreteria|ferragens|chaveiro|cerrajero|gas butano|gpl|glp",
    ),
  ],
  [
    "sight",
    rx(
      "miradouro|mirador|viewpoint|belvedere|aussichtspunkt|pico|cume|cumbre|ermita|igreja|iglesia|capela|capilla|" +
        "catedral|mosteiro|monasterio|convento|castelo|castillo|castro|castrexo|fortaleza|museu|museo|museum|musee|roman|romana|romano|" +
        "termas|caldas|caldaria|hot springs|hotsprings|praia|playa|plage|spiaggia|strand|cala|cascada|cascata|cachoeira|ponte romana|puente romano|" +
        "casa de indianos|ruinas|ruins|poblado|dolmen|anta|menhir|petroglifo|garganta|desfiladeiro|canon|lagoa|laguna|faro|farol|" +
        "spotting|parque natural|reserva natural|bosque|floresta|jardim|jardin|cueva|gruta|grotte|minas|fabrica|factory|barragem|embalse",
    ),
  ],
];

/** Category from the name, then (for the decisive kinds) the address. Null = ask OSM. */
/** A title that is just a street address ("R. Visc. Morais", "Calle Mayor 3"): nothing to classify. */
const STREET = /^(r|rua|rúa|av|avda|avenida|calle|c|carrer|travessa|tv|largo|praca|praza|plaza|pl|estrada|camino|caminho|rotunda|via|strada|rue|strasse)( |$)/;

export function categoryByRules(title: string | null | undefined, address?: string | null): Category | null {
  const t = norm(title);
  // Chains whose name is also an ordinary word ("Dia", "BM"): only when that's the whole name.
  if (t === "dia" || t === "bm" || t === "familia" || t === "lupa") return "grocery";
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  const a = norm(address);
  // The address only for the unmistakable kinds ("Edificio Intermarché…", "Parque de Campismo de …").
  for (const [cat, re] of RULES) if ((cat === "camp" || cat === "grocery" || cat === "fuel" || cat === "parking") && re.test(a)) return cat;
  if (STREET.test(t)) return "other"; // a street address was sent, not a place
  // A town by itself: the title is the address' first part and the address is just "Town, Region, Country".
  if (t && address) {
    const parts = address.split(",").map((p) => norm(p)).filter(Boolean);
    if (parts.length <= 4 && parts[0] === t && !/\d/.test(parts[0])) return "town";
  }
  return null;
}

// Cities with 100 k+ people (city proper): Iberia in full, the big ones on the way there.
const BIG_CITIES = words(
  // PT
  "lisboa|lisbon|porto|braga|coimbra|funchal|setubal|amadora|almada|vila nova de gaia|aveiro|leiria|faro|guimaraes|viseu|" +
    // ES
    "madrid|barcelona|valencia|sevilla|zaragoza|malaga|murcia|palma|palma de mallorca|las palmas|las palmas de gran canaria|bilbao|alicante|alacant|cordoba|" +
    "valladolid|vigo|gijon|hospitalet de llobregat|vitoria|vitoria gasteiz|a coruna|la coruna|granada|elche|elx|oviedo|badalona|cartagena|terrassa|" +
    "jerez de la frontera|sabadell|mostoles|santa cruz de tenerife|pamplona|iruna|almeria|alcala de henares|fuenlabrada|leganes|san sebastian|donostia|" +
    "getafe|burgos|albacete|santander|castellon de la plana|castello de la plana|alcorcon|la laguna|logrono|badajoz|salamanca|huelva|marbella|lleida|" +
    "tarragona|leon|cadiz|dos hermanas|mataro|torrejon de ardoz|parla|algeciras|jaen|ourense|reus|telde|barakaldo|lugo|girona|santiago de compostela|" +
    "caceres|lorca|san fernando|roquetas de mar|guadalajara|pontevedra|ponferrada|" +
    // FR / IT / DE on the way
    "paris|marseille|lyon|toulouse|nice|nantes|montpellier|strasbourg|bordeaux|lille|rennes|perpignan|pau|bayonne|" +
    "roma|rome|milano|milan|napoli|torino|turin|palermo|genova|bologna|firenze|florence|venezia|venice|verona|" +
    "berlin|hamburg|munchen|munich|koln|cologne|frankfurt am main|stuttgart|dusseldorf",
);
const CITY_RX = new RegExp(`(?:^|, |\\d{4}-\\d{3} |\\d{5} )(?:${BIG_CITIES.map((c) => c.replace(/ /g, " ")).join("|")})(?=,|$)`);

/** Inside a 100 k+ city, from the address ("…, 4050-182 Porto, Portugal" yes; "Porto Covo" no). */
export function inBigCity(address: string | null | undefined): boolean {
  if (!address) return false;
  // Keep the commas: the city is a whole address part.
  const a = (address ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´\-–—_]+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(\d{4}) (\d{3})/g, "$1-$2")
    .replace(/\s+/g, " ")
    .trim();
  return CITY_RX.test(a);
}

/** OSM tags → category (most specific key first). */
export function categoryFromTags(tags: Record<string, string>): Category | null {
  const t = (k: string) => tags[k];
  const tourism = t("tourism"), amenity = t("amenity"), shop = t("shop"), place = t("place");
  if (tourism === "camp_site" || tourism === "caravan_site" || amenity === "motorhome_parking") return "camp";
  if (amenity === "fuel" || amenity === "charging_station") return "fuel";
  if (shop && ["supermarket", "convenience", "greengrocer", "butcher", "grocery", "deli", "farm", "frozen_food", "health_food", "food"].includes(shop)) return "grocery";
  if (amenity === "marketplace") return "grocery";
  if (amenity && ["parking", "parking_space", "parking_entrance"].includes(amenity)) return "parking";
  if (amenity && ["restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "food_court", "biergarten"].includes(amenity)) return "eat";
  if (shop && ["bakery", "pastry", "confectionery"].includes(shop)) return "eat";
  if (
    (amenity && ["veterinary", "pharmacy", "hospital", "clinic", "doctors", "dentist", "post_office", "bank", "car_wash", "vehicle_inspection", "laundry", "townhall"].includes(amenity)) ||
    (shop && ["car_repair", "tyres", "laundry", "dry_cleaning", "tattoo", "hairdresser", "beauty", "locksmith", "hardware", "gas"].includes(shop)) ||
    t("craft") || t("office") || t("healthcare")
  )
    return "services";
  if (shop) return "shopping";
  if (place && ["city", "town", "village", "hamlet", "suburb", "neighbourhood", "isolated_dwelling", "locality"].includes(place)) return "town";
  if (
    (tourism && ["viewpoint", "attraction", "museum", "artwork", "gallery", "picnic_site", "zoo", "theme_park"].includes(tourism)) ||
    t("historic") || t("natural") || t("waterway") === "waterfall" || t("man_made") === "lighthouse" ||
    (t("leisure") && ["park", "nature_reserve", "beach_resort", "garden"].includes(t("leisure"))) ||
    amenity === "place_of_worship" || t("aeroway") === "aerodrome" || t("boundary") === "protected_area"
  )
    return "sight";
  return null;
}

/** Nominatim's reverse result (category + type) → category. */
export function categoryFromNominatim(category: string | undefined, type: string | undefined, addresstype?: string): Category | null {
  if (category && type) {
    const c = categoryFromTags({ [category]: type });
    if (c) return c;
  }
  if (category === "highway" || addresstype === "road") return "other"; // just a street
  if (addresstype && ["city", "town", "village", "hamlet", "suburb", "neighbourhood"].includes(addresstype)) return "town";
  return null;
}

// --- OSM lookup (server side, after answering) -------------------------------------------------

// A plain app name: Overpass needs none, Nominatim asks for an identifying User-Agent.
const UA = "MapPal-dock/1.0 (place categories)";

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const shares = (title: string, name: string) => {
  const tw = new Set(norm(title).split(" ").filter((w) => w.length >= 4));
  return norm(name).split(" ").some((w) => w.length >= 4 && tw.has(w));
};

type OsmEl = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Category from OSM at the pin: the named object that matches the title, else the nearest one we can map. */
export async function categoryByOsm(title: string, p: { lat: number; lng: number }, fetchFn: typeof fetch = fetch): Promise<Category | null> {
  // Named things at the pin (60 m), plus towns / villages around it (2 km) — a sent town's pin is
  // rarely on its place node.
  const q =
    `[out:json][timeout:8];(nwr(around:60,${p.lat},${p.lng})[name]` +
    `[~"^(tourism|amenity|shop|place|historic|natural|leisure|craft|office|healthcare|man_made)$"~"."];` +
    `node(around:2000,${p.lat},${p.lng})[place~"^(city|town|village|hamlet|suburb)$"][name];);out center tags 60;`;
  try {
    const res = await fetchFn("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: new URLSearchParams({ data: q }),
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) {
      const els = ((await res.json()) as { elements?: OsmEl[] }).elements ?? [];
      const scored = els
        .map((e) => {
          const at = e.center ? { lat: e.center.lat, lng: e.center.lon } : e.lat != null && e.lon != null ? { lat: e.lat, lng: e.lon } : null;
          const cat = e.tags ? categoryFromTags(e.tags) : null;
          const name = e.tags?.name ?? "";
          return { cat, d: at ? distanceM(p, at) : 999, match: !!name && shares(title, name), same: !!name && norm(name) === norm(title) };
        })
        .filter((x) => x.cat);
      // Sent exactly a town's name ("Allariz"): the town, even if a shop nearby carries its name.
      const town = scored.find((x) => x.same && x.cat === "town");
      if (town) return "town";
      // The object named like the title (a town counts only by name), else the nearest mapped one at the pin.
      const best =
        scored.find((x) => x.match && x.cat !== "town") ?? scored.find((x) => x.match) ??
        scored.filter((x) => x.cat !== "town").sort((a, b) => a.d - b.d).find((x) => x.d <= 40);
      if (best?.cat) return best.cat;
    }
  } catch {
    // Overpass busy / slow: Nominatim below.
  }
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${p.lat}&lon=${p.lng}`;
    const res = await fetchFn(u, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { category?: string; type?: string; addresstype?: string };
    return categoryFromNominatim(j.category, j.type, j.addresstype);
  } catch {
    return null;
  }
}
