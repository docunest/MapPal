// Wikipedia / Wikidata / Wikimedia Commons clients. All free, keyless APIs —
// Wikimedia only asks for an identifying User-Agent and polite request rates.
import { MAPPAL_USER_AGENT } from "./overpass";
import { distanceMeters, type LatLng } from "./geo";

type Params = Record<string, string | number | undefined>;

export class WikimediaError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/**
 * GET a MediaWiki action API. `cacheSeconds` opts into Next's persistent
 * fetch cache (shared across serverless instances; only 200s are stored) —
 * use it for stable lookups like articles and entities, never for anything
 * location-dependent.
 */
export async function mediawikiGet<T>(host: string, params: Params, cacheSeconds?: number): Promise<T> {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ format: "json", formatversion: 2, ...params })) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": MAPPAL_USER_AGENT, "Api-User-Agent": MAPPAL_USER_AGENT },
        signal: AbortSignal.timeout(10000),
        ...(cacheSeconds ? { cache: "force-cache" as const, next: { revalidate: cacheSeconds } } : {}),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new WikimediaError(`${host} ${res.status}`, true);
        const retryAfter = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Math.min(3000, (retryAfter || 0.5 * 2 ** attempt) * 1000)));
        continue;
      }
      if (!res.ok) throw new WikimediaError(`${host} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as T & { error?: { info?: string } };
      if (json.error) throw new WikimediaError(`${host}: ${json.error.info ?? "API error"}`);
      return json;
    } catch (err) {
      // Our own bad request or an API-level error won't fix itself; network
      // errors and timeouts might.
      if (err instanceof WikimediaError && !err.retryable) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new WikimediaError(`${host}: request failed`);
}

export const wikipediaHost = (lang: string) => `${lang}.wikipedia.org`;
export const wikipediaUrl = (lang: string, title: string) =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/** A Commons file as a resized thumbnail URL, without an API round trip. */
export function commonsThumb(file: string, width = 640): string {
  const name = file.replace(/^(File|Image):/i, "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

export const commonsFilePage = (file: string) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/^(File|Image):/i, "").replace(/ /g, "_"))}`;

// --- Wikipedia geosearch ---------------------------------------------------

export interface WikiGeoPage {
  lang: string;
  title: string;
  lat: number;
  lng: number;
  distance: number;
  description?: string;
  thumbnail?: string;
  wikidata?: string;
}

interface QueryPages<P> {
  query?: { pages?: P[] };
}

interface GeoPageRaw {
  pageid: number;
  title: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  description?: string;
  thumbnail?: { source: string };
  pageprops?: { wikibase_item?: string };
}

/** Articles with coordinates near a point (radius max 10 km per the API). */
export async function wikipediaNearby(
  lang: string,
  center: LatLng,
  radiusMeters: number,
  limit = 50,
): Promise<WikiGeoPage[]> {
  const data = await mediawikiGet<QueryPages<GeoPageRaw>>(wikipediaHost(lang), {
    action: "query",
    generator: "geosearch",
    ggscoord: `${center.lat}|${center.lng}`,
    ggsradius: Math.min(10000, Math.round(radiusMeters)),
    ggslimit: limit,
    prop: "coordinates|pageimages|description|pageprops",
    colimit: "max",
    piprop: "thumbnail",
    pithumbsize: 480,
    pilimit: "max",
    ppprop: "wikibase_item",
  });

  const pages: WikiGeoPage[] = [];
  for (const p of data.query?.pages ?? []) {
    const c = p.coordinates?.[0];
    if (!c) continue;
    pages.push({
      lang,
      title: p.title,
      lat: c.lat,
      lng: c.lon,
      distance: distanceMeters(center, { lat: c.lat, lng: c.lon }),
      description: p.description,
      thumbnail: p.thumbnail?.source,
      wikidata: p.pageprops?.wikibase_item,
    });
  }
  return pages.sort((a, b) => a.distance - b.distance);
}

// --- Wikipedia article -----------------------------------------------------

export interface WikiSection {
  heading: string;
  text: string;
}

export interface WikiArticle {
  lang: string;
  title: string;
  url: string;
  description?: string;
  lead: string;
  sections: WikiSection[];
  image?: string;
}

interface ArticleRaw {
  title: string;
  missing?: boolean;
  extract?: string;
  description?: string;
  fullurl?: string;
  thumbnail?: { source: string };
}

// Back-matter sections that are lists of links/citations rather than
// prose, across the languages MapPal's family is likely to read.
const SKIP_SECTIONS =
  /^(references|notes|external links|see also|further reading|bibliography|sources|literature|gallery|footnotes|citations|reference|odkazy|externí odkazy|literatura|související články|poznámky|referencias|enlaces externos|véase también|bibliografía|notas|einzelnachweise|weblinks|literatur|siehe auch|anmerkungen|références|liens externes|voir aussi|bibliographie|note|collegamenti esterni|voci correlate|bibliografia|przypisy|linki zewnętrzne|zobacz też|bibliografia|nuorodos|išnašos|šaltiniai|literatūra|referências|ligações externas|ver também)$/i;

/** Split a MediaWiki plain-text extract (exsectionformat=wiki) into sections. */
export function splitExtract(extract: string): { lead: string; sections: WikiSection[] } {
  const parts = extract.split(/\n*^(={2,})[ \t]*(.+?)[ \t]*\1[ \t]*$\n*/m);
  const lead = parts[0].trim();
  const sections: WikiSection[] = [];

  // parts after the lead come in triples: [equals, heading, body]
  let current: WikiSection | null = null;
  for (let i = 1; i + 2 < parts.length; i += 3) {
    const level = parts[i].length;
    const heading = parts[i + 1];
    const body = (parts[i + 2] ?? "").trim();
    if (level === 2 || !current) {
      current = { heading, text: body };
      sections.push(current);
    } else if (body) {
      // Fold subsections into their parent so the reader sees one block per topic.
      current.text += `${current.text ? "\n\n" : ""}${heading}\n${body}`;
    }
  }

  return {
    lead,
    sections: sections.filter((s) => !SKIP_SECTIONS.test(s.heading) && s.text.length > 80),
  };
}

export async function wikipediaArticle(lang: string, title: string): Promise<WikiArticle | null> {
  const data = await mediawikiGet<QueryPages<ArticleRaw>>(
    wikipediaHost(lang),
    {
      action: "query",
      titles: title,
      redirects: 1,
      prop: "extracts|description|info|pageimages",
      explaintext: 1,
      exsectionformat: "wiki",
      inprop: "url",
      piprop: "thumbnail",
      pithumbsize: 1000,
    },
    60 * 60 * 24,
  );
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) return null;

  const { lead, sections } = splitExtract(page.extract);
  return {
    lang,
    title: page.title,
    url: page.fullurl ?? wikipediaUrl(lang, page.title),
    description: page.description,
    lead,
    sections,
    image: page.thumbnail?.source,
  };
}

/** Title of the same article in another language, via interlanguage links. */
export async function wikipediaLanglink(fromLang: string, title: string, toLang: string): Promise<string | null> {
  const data = await mediawikiGet<QueryPages<{ langlinks?: Array<{ title: string }> }>>(
    wikipediaHost(fromLang),
    { action: "query", titles: title, redirects: 1, prop: "langlinks", lllang: toLang },
    60 * 60 * 24 * 7,
  );
  return data.query?.pages?.[0]?.langlinks?.[0]?.title ?? null;
}

// --- Wikidata --------------------------------------------------------------

export interface WikidataSnakValue {
  "entity-type"?: string;
  id?: string;
  time?: string;
  amount?: string;
  unit?: string;
  text?: string;
}

export interface WikidataEntity {
  id: string;
  missing?: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<
    string,
    Array<{ rank?: string; mainsnak: { datavalue?: { value: WikidataSnakValue | string } } }>
  >;
}

/**
 * Batch-fetch entities (50 ids per request, the API's limit). `props` keeps
 * the payload small: e.g. "sitelinks" alone for fame counting.
 */
export async function wikidataEntities(
  ids: string[],
  props = "labels|descriptions|claims|sitelinks",
  languages?: string[],
  cacheSeconds = 60 * 60 * 24,
): Promise<Record<string, WikidataEntity>> {
  const unique = [...new Set(ids.filter((id) => /^Q\d+$/.test(id)))];
  const out: Record<string, WikidataEntity> = {};

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));

  await Promise.all(
    chunks.map(async (chunk) => {
      const data = await mediawikiGet<{ entities?: Record<string, WikidataEntity> }>(
        "www.wikidata.org",
        {
          action: "wbgetentities",
          ids: chunk.join("|"),
          props,
          languages: languages?.join("|"),
          languagefallback: 1,
          formatversion: 1,
        },
        cacheSeconds,
      );
      for (const [id, entity] of Object.entries(data.entities ?? {})) {
        if (!entity.missing) out[id] = entity;
      }
    }),
  );
  return out;
}

export interface ImageAndFame {
  image?: string;
  /** Total sitelinks (all Wikimedia sites) — a cheap "how famous is it" proxy. */
  sitelinks: number;
}

/**
 * Photo (P18) and fame for many items in one SPARQL round trip — far lighter
 * than wbgetentities with claims, which ships every statement of a city.
 */
export async function wikidataImagesAndFame(qids: string[]): Promise<Record<string, ImageAndFame>> {
  const unique = [...new Set(qids.filter((id) => /^Q\d+$/.test(id)))];
  const out: Record<string, ImageAndFame> = {};
  for (let i = 0; i < unique.length; i += 250) {
    const chunk = unique.slice(i, i + 250);
    const query = `SELECT ?item ?links (SAMPLE(?img) AS ?image) WHERE {
  VALUES ?item { ${chunk.map((q) => `wd:${q}`).join(" ")} }
  ?item wikibase:sitelinks ?links .
  OPTIONAL { ?item wdt:P18 ?img }
} GROUP BY ?item ?links`;
    const send = () =>
      fetch("https://query.wikidata.org/sparql", {
        method: "POST",
        headers: {
          "User-Agent": MAPPAL_USER_AGENT,
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `query=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
        cache: "force-cache",
        next: { revalidate: 60 * 60 * 24 },
      });
    let res = await send();
    // The query service throws the odd transient 502/503; one retry clears it.
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await send();
    }
    if (!res.ok) throw new WikimediaError(`query.wikidata.org ${res.status}`, res.status === 429 || res.status >= 500);
    const json = (await res.json()) as {
      results: { bindings: Array<{ item: { value: string }; links: { value: string }; image?: { value: string } }> };
    };
    for (const b of json.results.bindings) {
      const id = b.item.value.split("/").pop()!;
      const file = b.image ? decodeURIComponent(b.image.value.split("/").pop()!) : undefined;
      out[id] = { sitelinks: Number(b.links.value), image: file ? commonsThumb(file, 480) : undefined };
    }
  }
  return out;
}

export function sitelinkCount(entity: WikidataEntity | undefined): number {
  if (!entity?.sitelinks) return 0;
  // Only Wikipedias count toward "how famous is this" — skip commonswiki,
  // wikivoyage, wikiquote etc., which inflate counts without meaning reach.
  return Object.keys(entity.sitelinks).filter((k) => /^[a-z_]+wiki$/.test(k) && k !== "commonswiki").length;
}

export function claimValues(entity: WikidataEntity | undefined, property: string): Array<WikidataSnakValue | string> {
  const claims = entity?.claims?.[property] ?? [];
  const preferred = claims.filter((c) => c.rank === "preferred");
  return (preferred.length ? preferred : claims.filter((c) => c.rank !== "deprecated"))
    .map((c) => c.mainsnak.datavalue?.value)
    .filter((v): v is WikidataSnakValue | string => v !== undefined);
}

export function entityLabel(entity: WikidataEntity | undefined, langs: string[]): string | undefined {
  for (const l of [...langs, "en", "mul"]) {
    const v = entity?.labels?.[l]?.value;
    if (v) return v;
  }
  const any = entity?.labels && Object.values(entity.labels)[0];
  return any?.value;
}

export function entityDescription(entity: WikidataEntity | undefined, langs: string[]): string | undefined {
  for (const l of [...langs, "en"]) {
    const v = entity?.descriptions?.[l]?.value;
    if (v) return v;
  }
  return undefined;
}

// --- Commons photos --------------------------------------------------------

export interface CommonsPhoto {
  file: string;
  thumb: string;
  page: string;
  lat?: number;
  lng?: number;
  distance?: number;
}

interface CommonsPageRaw {
  title: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  imageinfo?: Array<{ thumburl?: string; descriptionurl?: string; mime?: string }>;
}

function toPhotos(pages: CommonsPageRaw[], center?: LatLng): CommonsPhoto[] {
  const photos: CommonsPhoto[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl || (info.mime && !info.mime.startsWith("image/"))) continue;
    const c = p.coordinates?.[0];
    photos.push({
      file: p.title.replace(/^File:/, ""),
      thumb: info.thumburl,
      page: info.descriptionurl ?? commonsFilePage(p.title),
      lat: c?.lat,
      lng: c?.lon,
      distance: c && center ? distanceMeters(center, { lat: c.lat, lng: c.lon }) : undefined,
    });
  }
  return photos;
}

/** Geotagged Commons photos taken near a point — "what does this spot look like". */
export async function commonsPhotosNear(center: LatLng, radiusMeters: number, limit = 12): Promise<CommonsPhoto[]> {
  const data = await mediawikiGet<QueryPages<CommonsPageRaw>>("commons.wikimedia.org", {
    action: "query",
    generator: "geosearch",
    ggsnamespace: 6,
    ggscoord: `${center.lat}|${center.lng}`,
    ggsradius: Math.min(10000, Math.max(10, Math.round(radiusMeters))),
    ggslimit: limit,
    prop: "imageinfo|coordinates",
    iiprop: "url|mime",
    iiurlwidth: 640,
  });
  return toPhotos(data.query?.pages ?? [], center).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

export async function commonsCategoryPhotos(category: string, limit = 12): Promise<CommonsPhoto[]> {
  const data = await mediawikiGet<QueryPages<CommonsPageRaw>>(
    "commons.wikimedia.org",
    {
      action: "query",
      generator: "categorymembers",
      gcmtitle: `Category:${category.replace(/^Category:/i, "")}`,
      gcmtype: "file",
      gcmlimit: limit,
      prop: "imageinfo",
      iiprop: "url|mime",
      iiurlwidth: 640,
    },
    60 * 60 * 24,
  );
  return toPhotos(data.query?.pages ?? []);
}
