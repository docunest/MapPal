// Which Wikipedia covers a country's local sights best. Local-language
// Wikipedias have far more geotagged articles about local factories, mines
// and bridges than English does (e.g. Ostrava-Vítkovice: 50 cs vs 21 en
// within 2.5 km, and the en ones are mostly districts and dioceses).
const COUNTRY_WIKI_LANG: Record<string, string> = {
  AD: "ca", AL: "sq", AT: "de", BA: "bs", BE: "nl", BG: "bg", BY: "be", CH: "de", CY: "el", CZ: "cs",
  DE: "de", DK: "da", EE: "et", ES: "es", FI: "fi", FR: "fr", GB: "en", GR: "el", HR: "hr", HU: "hu",
  IE: "en", IS: "is", IT: "it", LI: "de", LT: "lt", LU: "lb", LV: "lv", MC: "fr", MD: "ro", ME: "sr",
  MK: "mk", MT: "mt", NL: "nl", NO: "no", PL: "pl", PT: "pt", RO: "ro", RS: "sr", RU: "ru", SE: "sv",
  SI: "sl", SK: "sk", SM: "it", TR: "tr", UA: "uk", VA: "it", XK: "sq",
  AR: "es", AU: "en", BR: "pt", CA: "en", CL: "es", CN: "zh", CO: "es", EG: "ar", IL: "he", IN: "en",
  JP: "ja", KR: "ko", MA: "fr", MX: "es", NZ: "en", PE: "es", TH: "th", TN: "fr", US: "en", ZA: "en",
};

export function wikiLangForCountry(iso2: string | undefined): string | undefined {
  return iso2 ? COUNTRY_WIKI_LANG[iso2.toUpperCase()] : undefined;
}

/** Normalize a BCP-47-ish tag ("en-GB", "cs") to a Wikipedia subdomain. */
export function normalizeLang(lang: string | null | undefined, fallback = "en"): string {
  const base = (lang ?? "").toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? base : fallback;
}
