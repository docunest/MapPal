// First-run seeds for the two phase-3 scenarios. Once a scenario exists in
// the DB, the DB copy is the source of truth (new versions are saved from
// the prompt studio / API) and these are never re-applied — same pattern as
// prompt templates and categories.
//
// The prompts are the owner's use cases from docs/PLAN.md, reworded as
// instructions. The brand lists are a starting point for the top-down agent
// (which refines them per area) and for runs without AI; the owner edits them.
import type { ScenarioConfig } from "./types";

export interface DefaultScenario {
  slug: string;
  title: string;
  icon: string;
  description: string;
  prompt: string;
  config: ScenarioConfig;
}

const GROCERIES: DefaultScenario = {
  slug: "groceries",
  title: "Groceries",
  icon: "🛒",
  description: "Where to do the big shop: biggest, cheapest, best selection — not just the nearest.",
  prompt: `We are a family of five (plus a dog) living in a camper van in Spain and Portugal and we need to do a proper grocery shop.
Prefer the biggest, cheapest store with the best selection over the nearest one: hypermarkets and big discount/regional supermarket chains first, small shops only when nothing better is reachable.
On Spanish Sundays, Saturday afternoons and public holidays big stores are often closed: keep them visible (marked closed) and show the small shops that are open.
Always use the real opening hours; never assume a store is open.`,
  config: {
    categoryLabel: "grocery store / supermarket",
    osmTags: [
      ["shop", "supermarket"],
      ["shop", "convenience"],
      ["shop", "greengrocer"],
      ["shop", "bakery"],
      ["shop", "butcher"],
      ["shop", "farm"],
      ["shop", "deli"],
      ["shop", "seafood"],
      ["amenity", "marketplace"],
    ],
    nameKeywords: ["supermercad", "supermercat", "hipermercad", "mercado municipal", "mercado de abastos"],
    brands: {
      ES: [
        { tier: 1, brands: ["Alcampo", "Carrefour", "Hipercor", "E.Leclerc", "Eroski Hipermercado"] },
        {
          tier: 2,
          brands: [
            "Mercadona", "Lidl", "Aldi", "Carrefour Market", "Eroski", "Consum", "Gadis", "Froiz", "BM Supermercados",
            "Ahorramas", "Masymas", "Lupa", "Bonpreu", "Caprabo", "Alimerka", "HiperDino", "Supercor", "El Árbol",
          ],
        },
        {
          tier: 3,
          brands: [
            "Dia", "Carrefour Express", "Eroski City", "Mi Alcampo", "Spar", "Covirán", "Condis", "Suma", "Charter", "Unide",
          ],
        },
      ],
      PT: [
        { tier: 1, brands: ["Continente", "Auchan", "E.Leclerc", "Jumbo"] },
        { tier: 2, brands: ["Pingo Doce", "Lidl", "Aldi", "Intermarché", "Mercadona", "Continente Modelo", "Auchan Supermercado"] },
        { tier: 3, brands: ["Minipreço", "Continente Bom Dia", "Meu Super", "Spar", "Amanhecer", "Coviran", "My Auchan"] },
      ],
    },
    tagTier: { "shop=supermarket": 4, "amenity=marketplace": 4 },
    lastTier: 5,
    tierLabels: { 1: "Hypermarket", 2: "Big supermarket", 3: "Small chain", 4: "Supermarket / market", 5: "Small shop" },
    tierBonusKm: { 1: 10, 2: 6, 3: 2, 4: 1, 5: 0 },
    bigTiers: [1, 2],
    uncertainTags: [],
    perTier: 5,
  },
};

const CONSTRUCTION: DefaultScenario = {
  slug: "construction-stores",
  title: "Construction stores",
  icon: "🔧",
  description: "DIY, hardware and building materials: big-box near cities, real local shops elsewhere.",
  prompt: `We need a construction / DIY / hardware store (tools, screws, sealant, plumbing and electrical parts for the camper).
Near cities, rank the region's big-box stores first (e.g. Leroy Merlin, BAUHAUS, Brico Depôt).
Also include small local shops that genuinely sell hardware — ferreterías, drogarias, building-material suppliers, and Chinese bazaars that carry tools.
When there is no big-box store nearby, show every local store that is genuinely a construction/hardware store, and drop places that are mislabelled (a bazaar that only sells clothes is not a hardware store).
Always use the real opening hours; never assume a store is open.`,
  config: {
    categoryLabel: "construction / DIY / hardware store",
    osmTags: [
      ["shop", "doityourself"],
      ["shop", "hardware"],
      ["shop", "trade"],
      ["shop", "building_materials"],
      ["shop", "variety_store"],
    ],
    nameKeywords: [
      "ferreter", "ferretar", "ferrax", "ferragens", "bricola", "materiales de constru", "materiais de constru",
      "drogaria", "burdindegi", "bazar",
    ],
    brands: {
      "*": [{ tier: 1, brands: ["Leroy Merlin", "BAUHAUS", "Brico Depôt", "Brico Dépôt"] }],
      ES: [
        { tier: 1, brands: ["Bricomart", "Obramat", "Bricor", "BricoKing"] },
        { tier: 2, brands: ["Cadena88", "Ferrokey", "BigMat", "Würth", "Saltoki"] },
      ],
      PT: [
        { tier: 1, brands: ["AKI", "Maxmat", "Bricomarché"] },
        { tier: 2, brands: ["BigMat", "Würth"] },
      ],
    },
    tagTier: { "shop=doityourself": 2, "shop=hardware": 2, "shop=trade": 2, "shop=building_materials": 2 },
    lastTier: 3,
    tierLabels: { 1: "Big-box DIY", 2: "Local hardware / DIY", 3: "Bazaar / other (checked)" },
    tierBonusKm: { 1: 20, 2: 3, 3: 0 },
    bigTiers: [1],
    uncertainTags: ["shop=variety_store"],
    perTier: 6,
  },
};

export const DEFAULT_SCENARIOS: DefaultScenario[] = [GROCERIES, CONSTRUCTION];

/** The 10 acceptance points from docs/PLAN.md (coordinates: OSM/Nominatim). */
export const ACCEPTANCE_POINTS = [
  { slug: "puerto-sagunto", name: "Puerto de Sagunto", lat: 39.665, lng: -0.233, country: "ES", area: "ES-VC" },
  { slug: "aviles", name: "Avilés", lat: 43.5555, lng: -5.9222, country: "ES", area: "ES-AS" },
  { slug: "matosinhos", name: "Matosinhos", lat: 41.185, lng: -8.695, country: "PT", area: "PT-13" },
  { slug: "pinhao", name: "Pinhão", lat: 41.191, lng: -7.546, country: "PT", area: "PT-17" },
  { slug: "poncebos", name: "Garganta del Cares / Poncebos", lat: 43.2618, lng: -4.8314, country: "ES", area: "ES-AS" },
  { slug: "arenas-de-cabrales", name: "Arenas de Cabrales", lat: 43.3015, lng: -4.8136, country: "ES", area: "ES-AS" },
  { slug: "mertola", name: "Mértola", lat: 37.6385, lng: -7.6606, country: "PT", area: "PT-02" },
  { slug: "peniche", name: "Peniche", lat: 39.3569, lng: -9.3787, country: "PT", area: "PT-10" },
  { slug: "lisbon-baixa", name: "Lisbon (Baixa)", lat: 38.711, lng: -9.137, country: "PT", area: "PT-11" },
  { slug: "madrid-lavapies", name: "Madrid (Lavapiés)", lat: 40.4087, lng: -3.701, country: "ES", area: "ES-MD" },
] as const;
