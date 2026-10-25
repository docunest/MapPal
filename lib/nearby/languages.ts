// Which Wikipedias describe the sights around a point best. Local-language
// Wikipedias have far more geotagged articles about local factories, mines
// and bridges than English (seen in testing: Puerto de Sagunto has a power
// station article only in es/ca). In Spain the co-official languages matter
// too: Catalan in Catalonia/Valencia/Balearics, Galician in Galicia, Basque
// in the Basque Country and Navarre.
import type { Region } from "../nominatim";

const COUNTRY_WIKI_LANG: Record<string, string> = {
  ES: "es", PT: "pt", AD: "ca", FR: "fr", IT: "it", DE: "de", AT: "de", CH: "de", GB: "en", IE: "en",
  NL: "nl", BE: "nl", LU: "fr", CZ: "cs", SK: "sk", PL: "pl", MA: "fr", US: "en",
};

const SPANISH_REGION_LANG: Record<string, string> = {
  "ES-CT": "ca",
  "ES-VC": "ca",
  "ES-IB": "ca",
  "ES-GA": "gl",
  "ES-PV": "eu",
  "ES-NC": "eu",
};

/** Local Wikipedia languages for a region, most important first (max 2). */
export function localLangsFor(region: Region): string[] {
  const langs: string[] = [];
  const main = region.country ? COUNTRY_WIKI_LANG[region.country] : undefined;
  if (main) langs.push(main);
  const coOfficial = region.region ? SPANISH_REGION_LANG[region.region] : undefined;
  if (coOfficial) langs.push(coOfficial);
  return langs.slice(0, 2);
}

/** Normalize a BCP-47-ish tag ("en-GB", "pt") to a Wikipedia subdomain. */
export function normalizeLang(lang: string | null | undefined, fallback = "en"): string {
  const base = (lang ?? "").toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? base : fallback;
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", pt: "Portuguese", ca: "Catalan", gl: "Galician", eu: "Basque", fr: "French",
};
