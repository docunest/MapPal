// Lens: "you might be seeing…" — notable things within 0.5–3 km of the
// traveller, ranked by how visible and how interesting they are, with the
// direction relative to the car's heading when we know it.
import {
  bearingDegrees,
  compassLabel,
  distanceMeters,
  nearestOnPolyline,
  relativeDirection,
  type LatLng,
  type RelativeDirection,
} from "../geo";
import { elementLatLng, overpassQuery, type OverpassElement } from "../overpass";
import {
  claimValues,
  commonsThumb,
  entityDescription,
  sitelinkCount,
  wikidataEntities,
  wikipediaNearby,
  type WikidataEntity,
  type WikiGeoPage,
} from "../wikimedia";
import { reverseCountry } from "../nominatim";
import { wikiLangForCountry } from "./languages";
import {
  classifyDescription,
  classifyTags,
  GENERIC_LANDMARK,
  isLensNoise,
  type LensGroup,
  type LensKind,
} from "./lensKinds";

export interface WikiRef {
  lang: string;
  title: string;
}

export interface LensItem {
  id: string;
  name: string;
  /** Original-language name when it differs from the displayed one. */
  localName?: string;
  kind: string;
  kindLabel: string;
  icon: string;
  group: LensGroup;
  lat: number;
  lng: number;
  distance: number;
  bearing: number;
  compass: string;
  direction?: RelativeDirection;
  description?: string;
  /** Language of `description` when it isn't the reader's language. */
  descriptionLang?: string;
  image?: string;
  wikidata?: string;
  wiki: WikiRef[];
  osm?: string;
  facts: string[];
  fame: number;
  score: number;
}

export interface LensPlace {
  name: string;
  wikidata?: string;
  level: number;
}

export interface LensResult {
  here: LensPlace[];
  country?: string;
  localLang?: string;
  items: LensItem[];
  warnings: string[];
}

export interface LensOptions {
  center: LatLng;
  radius: number;
  heading?: number;
  userLang: string;
  localLangHint?: string;
}

const MIN_RADIUS = 500;
const MAX_RADIUS = 3000;

export function clampLensRadius(r: number): number {
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(r) || 2000));
}

export function buildLensQuery({ lat, lng }: LatLng, radius: number): string {
  const r = clampLensRadius(radius);
  const near = `(around:${r},${lat},${lng})`;
  const small = `(around:${Math.min(r, 500)},${lat},${lng})`;
  const lineR = `(around:${Math.min(r, 1500)},${lat},${lng})`;
  const railR = `(around:${Math.min(r, 1000)},${lat},${lng})`;
  return `[out:json][timeout:25];
is_in(${lat},${lng})->.here;
area.here["boundary"="administrative"]["admin_level"~"^(2|4|6|7|8|9|10)$"];
out tags;
(
  nwr["wikipedia"]${near};
  nwr["wikidata"]["name"]${near};
  nwr["man_made"~"^(works|chimney|gasometer|gasholder|mineshaft|adit|headframe|tower|mast|water_tower|lighthouse|windmill|watermill|dam|bridge|silo)$"]${near};
  nwr["power"="plant"]${near};
  nwr["landuse"~"^(quarry|industrial)$"]["name"]${near};
  nwr["industrial"]["name"]${near};
  nwr["craft"="brewery"]${near};
  nwr["railway"~"^(station|halt)$"]${near};
  nwr["aerialway"]["name"]${near};
  nwr["historic"]["historic"!~"^(wayside_cross|wayside_shrine|boundary_stone|milestone|memorial|tomb|grave|yes)$"]${near};
  nwr["historic"="memorial"]["name"]${small};
  nwr["natural"~"^(peak|volcano|gorge|canyon|valley|cliff|arch|glacier|rock|stone|spring|hot_spring|ridge)$"]["name"]${near};
  nwr["natural"="cave_entrance"]${near};
  nwr["natural"="water"]["name"]${near};
  nwr["waterway"~"^(waterfall|dam|weir|lock_gate)$"]${near};
  nwr["tourism"~"^(attraction|museum|viewpoint|zoo|aquarium|theme_park)$"]${near};
  nwr["tourism"="artwork"]["name"]${small};
  nwr["amenity"="marketplace"]${near};
  nwr["aeroway"="aerodrome"]["name"]${near};
  nwr["leisure"="stadium"]["name"]${near};
);
out tags center qt;
way["waterway"~"^(river|canal)$"]["name"]${lineR};
out tags geom qt;
way["railway"~"^(rail|narrow_gauge|preserved)$"]${railR}->.rails;
.rails out ids center qt;
rel(bw.rails)["route"="railway"];
out tags qt;`;
}

interface Candidate {
  key: string;
  kind: LensKind | null;
  lat: number;
  lng: number;
  distance: number;
  tags?: Record<string, string>;
  osm?: string;
  wikidata?: string;
  pages: WikiGeoPage[];
}

function osmWikiRef(tags: Record<string, string>): WikiRef | undefined {
  const m = /^([a-z-]{2,12}):(.+)$/.exec(tags.wikipedia ?? "");
  return m ? { lang: m[1], title: m[2] } : undefined;
}

/**
 * Turn raw Overpass elements + geosearch pages into one candidate per real
 * thing (merged by Wikidata id), with distances. Pure — tested with fixtures.
 */
export function collectCandidates(
  center: LatLng,
  elements: OverpassElement[],
  pages: WikiGeoPage[],
): { candidates: Candidate[]; here: LensPlace[]; country?: string } {
  const byKey = new Map<string, Candidate>();
  const here: LensPlace[] = [];
  let country: string | undefined;

  const upsert = (c: Candidate) => {
    const existing = byKey.get(c.key);
    if (!existing) {
      byKey.set(c.key, c);
      return;
    }
    // Same thing seen twice (e.g. a works area and its building share a QID):
    // keep the nearest geometry, the most specific kind, and all pages.
    if (c.distance < existing.distance) {
      existing.lat = c.lat;
      existing.lng = c.lng;
      existing.distance = c.distance;
    }
    if (!existing.kind || (existing.kind === GENERIC_LANDMARK && c.kind)) existing.kind = c.kind;
    existing.tags ??= c.tags;
    existing.osm ??= c.osm;
    existing.pages.push(...c.pages);
  };

  const railCenters: LatLng[] = [];
  const railRelations: OverpassElement[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};

    if (el.type === "area") {
      const level = Number(tags.admin_level);
      if (level === 2) country = tags["ISO3166-1"] ?? tags["ISO3166-1:alpha2"];
      if (tags.name) here.push({ name: tags["name:en"] ?? tags.name, wikidata: tags.wikidata, level });
      continue;
    }

    // `out ids center` rail ways come back without tags.
    if (el.type === "way" && !el.tags) {
      const p = elementLatLng(el);
      if (p) railCenters.push(p);
      continue;
    }
    if (el.type === "relation" && tags.route === "railway") {
      railRelations.push(el);
      continue;
    }

    if (isLensNoise(tags, el.type)) continue;
    let kind = classifyTags(tags);
    if (!kind && (tags.wikidata || tags.wikipedia)) kind = GENERIC_LANDMARK;
    if (!kind) continue;

    let point = elementLatLng(el);
    let distance = point ? distanceMeters(center, point) : Infinity;
    if (el.geometry?.length) {
      // Rivers/canals: the nearest bank, not the middle of a 5 km way.
      const nearest = nearestOnPolyline(
        center,
        el.geometry.map((g) => ({ lat: g.lat, lng: g.lon })),
      );
      point = nearest.point;
      distance = nearest.distance;
    }
    if (!point) continue;

    const key = tags.wikidata ?? (kind.slug === "river" || kind.slug === "canal" ? `river:${tags.name}` : `osm:${el.type}/${el.id}`);
    upsert({
      key,
      kind,
      lat: point.lat,
      lng: point.lng,
      distance,
      tags,
      osm: `${el.type}/${el.id}`,
      wikidata: tags.wikidata,
      pages: [],
    });
  }

  if (railRelations.length && railCenters.length) {
    // Which nearby track belongs to which line isn't in the output, so every
    // line through the nearby tracks gets the nearest track's distance.
    let nearest = railCenters[0];
    let nearestD = Infinity;
    for (const p of railCenters) {
      const d = distanceMeters(center, p);
      if (d < nearestD) {
        nearest = p;
        nearestD = d;
      }
    }
    for (const rel of railRelations) {
      const tags = rel.tags ?? {};
      upsert({
        key: tags.wikidata ?? `osm:relation/${rel.id}`,
        kind: classifyTags(tags),
        lat: nearest.lat,
        lng: nearest.lng,
        distance: nearestD,
        tags,
        osm: `relation/${rel.id}`,
        wikidata: tags.wikidata,
        pages: [],
      });
    }
  }

  for (const page of pages) {
    upsert({
      key: page.wikidata ?? `wp:${page.lang}:${page.title}`,
      kind: null,
      lat: page.lat,
      lng: page.lng,
      distance: page.distance,
      wikidata: page.wikidata,
      pages: [page],
    });
  }

  here.sort((a, b) => b.level - a.level);
  return { candidates: [...byKey.values()], here, country };
}

function describeFromTags(tags: Record<string, string> | undefined): string[] {
  if (!tags) return [];
  const facts: string[] = [];
  if (tags.operator) facts.push(`Run by ${tags.operator}`);
  if (tags.product) facts.push(`Makes: ${tags.product.replace(/;/g, ", ")}`);
  if (tags["plant:source"] || tags["generator:source"]) facts.push(`Power from ${tags["plant:source"] ?? tags["generator:source"]}`);
  if (tags["plant:output:electricity"]) facts.push(`Output ${tags["plant:output:electricity"]}`);
  if (tags.height) facts.push(`${tags.height.replace(/\s*m$/, "")} m tall`);
  if (tags.ele) facts.push(`${tags.ele.replace(/\s*m$/, "")} m above sea level`);
  if (tags.start_date) facts.push(`Since ${tags.start_date}`);
  if (tags.resource) facts.push(`Digs for ${tags.resource}`);
  if (tags.historic && tags.historic !== "yes" && !tags.name) facts.push(`Historic ${tags.historic.replace(/_/g, " ")}`);
  if (Object.keys(tags).some((k) => /^(disused|abandoned):/.test(k))) facts.push("No longer in use");
  return facts;
}

function imageFromTags(tags: Record<string, string> | undefined): string | undefined {
  const commons = tags?.wikimedia_commons;
  if (commons?.startsWith("File:")) return commonsThumb(commons, 480);
  const img = tags?.image;
  if (img && /^https:\/\/upload\.wikimedia\.org\//.test(img)) return img;
  if (img?.startsWith("File:")) return commonsThumb(img, 480);
  return undefined;
}

function scoreItem(
  kind: LensKind,
  distance: number,
  hasArticle: boolean,
  fame: number,
  hasImage: boolean,
  direction: RelativeDirection | undefined,
  radius: number,
): number {
  const visible = Math.min(kind.visibleM, radius);
  // Outside its plausible visibility it's "nearby", not "you're seeing it":
  // keep notable ones at a low score, drop the rest.
  const proximity = distance <= visible ? Math.pow(1 - distance / (visible * 1.15), 0.6) : hasArticle ? 0.08 : 0;
  if (proximity <= 0) return 0;
  const notability = (hasArticle ? 1 : 0.55) + Math.min(0.5, Math.log10(1 + fame) * 0.35) + (hasImage ? 0.1 : 0);
  const directionFactor = direction === "ahead" ? 1.25 : direction === "behind" ? 0.7 : 1;
  return kind.weight * notability * proximity * directionFactor;
}

/** Build display items from candidates + Wikidata entities. Pure — tested with fixtures. */
export function rankCandidates(
  center: LatLng,
  candidates: Candidate[],
  entities: Record<string, WikidataEntity>,
  opts: { userLang: string; localLang?: string; heading?: number; radius: number },
): LensItem[] {
  const { userLang, localLang, heading, radius } = opts;
  const items: LensItem[] = [];

  for (const c of candidates) {
    const entity = c.wikidata ? entities[c.wikidata] : undefined;
    const enDescription = entityDescription(entity, ["en"]);
    const kind = c.kind ?? classifyDescription(enDescription ?? c.pages.find((p) => p.lang === "en")?.description);
    if (!kind) continue;

    // Articles we could deep-dive into, reader's language first.
    const wiki: WikiRef[] = [];
    const addRef = (ref: WikiRef | undefined) => {
      if (ref && !wiki.some((w) => w.lang === ref.lang)) wiki.push(ref);
    };
    for (const lang of [userLang, localLang, "en"]) {
      if (!lang) continue;
      const sl = entity?.sitelinks?.[`${lang}wiki`];
      if (sl) addRef({ lang, title: sl.title });
      const page = c.pages.find((p) => p.lang === lang);
      if (page) addRef({ lang, title: page.title });
    }
    if (c.tags) addRef(osmWikiRef(c.tags));

    const hasArticle = wiki.length > 0;
    // A wikidata-only OSM item with no article anywhere is usually a small
    // memorial or artwork catalogue entry — not worth a card.
    if (kind === GENERIC_LANDMARK && !hasArticle) continue;

    const fame = sitelinkCount(entity);
    const userPage = c.pages.find((p) => p.lang === userLang);
    const anyPage = userPage ?? c.pages[0];
    const label =
      entity?.labels?.[userLang]?.value ??
      c.tags?.[`name:${userLang}`] ??
      userPage?.title ??
      c.tags?.name ??
      anyPage?.title ??
      Object.values(entity?.labels ?? {})[0]?.value;
    if (!label) continue;

    const localName = c.tags?.name ?? c.pages.find((p) => p.lang === localLang)?.title;
    const facts = describeFromTags(c.tags);

    let description = entity?.descriptions?.[userLang]?.value ?? userPage?.description;
    let descriptionLang: string | undefined;
    if (!description && anyPage?.description) {
      description = anyPage.description;
      descriptionLang = anyPage.lang;
    }
    if (!description && facts.length) description = facts.join(" · ");

    const image = userPage?.thumbnail ?? c.pages.find((p) => p.thumbnail)?.thumbnail ?? imageFromTags(c.tags);

    const bearing = bearingDegrees(center, c);
    const direction = heading !== undefined ? relativeDirection(heading, bearing) : undefined;
    const score = scoreItem(kind, c.distance, hasArticle, fame, !!image, direction, radius);
    if (score <= 0) continue;

    items.push({
      id: c.key,
      name: label,
      localName: localName && localName !== label ? localName : undefined,
      kind: kind.slug,
      kindLabel: kind.label,
      icon: kind.icon,
      group: kind.group,
      lat: c.lat,
      lng: c.lng,
      distance: Math.round(c.distance),
      bearing: Math.round(bearing),
      compass: compassLabel(bearing),
      direction,
      description,
      descriptionLang,
      image,
      wikidata: c.wikidata,
      wiki,
      osm: c.osm,
      facts,
      fame,
      score: Math.round(score * 1000) / 1000,
    });
  }

  items.sort((a, b) => b.score - a.score);

  // Same name within 300 m is the same thing seen through two sources that
  // didn't share a Wikidata id (common for stations and castles).
  const deduped: LensItem[] = [];
  for (const item of items) {
    const dup = deduped.find(
      (d) => d.name.toLowerCase() === item.name.toLowerCase() && distanceMeters(d, item) < 300,
    );
    if (!dup) deduped.push(item);
  }
  return deduped.slice(0, 40);
}

export async function runLens(opts: LensOptions): Promise<LensResult> {
  const { center, userLang } = opts;
  const radius = clampLensRadius(opts.radius);
  const warnings: string[] = [];

  const geosearch = async (lang: string) => {
    try {
      return await wikipediaNearby(lang, center, radius, 50);
    } catch (err) {
      warnings.push(`Wikipedia (${lang}) unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  };

  const hint = opts.localLangHint && opts.localLangHint !== userLang ? opts.localLangHint : undefined;
  const langs = [...new Set([userLang, "en", hint].filter((l): l is string => !!l))];

  const overpassP = overpassQuery(buildLensQuery(center, radius), { timeoutMs: 15000, totalBudgetMs: 20000 }).catch((err) => {
    warnings.push(`OpenStreetMap unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return [] as OverpassElement[];
  });
  const pagesP = Promise.all(langs.map(geosearch));

  const [elements, pageLists] = await Promise.all([overpassP, pagesP]);
  const pages = pageLists.flat();
  let { candidates, here, country } = collectCandidates(center, elements, pages);

  // First visit to a country: we only learn its language from the OSM
  // country lookup, so fetch that Wikipedia now. The client passes the
  // language back as a hint afterwards, so this extra hop is one-off.
  if (!country && !hint) {
    // Overpass down: still find the country so we can read the local Wikipedia.
    country = await reverseCountry(center).catch(() => undefined);
  }
  const localLang = wikiLangForCountry(country) ?? hint;
  if (localLang && !langs.includes(localLang)) {
    const localPages = await geosearch(localLang);
    const merged = collectCandidates(center, elements, [...pages, ...localPages]);
    candidates = merged.candidates;
    here = merged.here;
  }

  if (!elements.length && !pages.length) {
    throw new Error(warnings.join("; ") || "No data sources responded");
  }

  const qids = candidates.map((c) => c.wikidata).filter((q): q is string => !!q);
  let entities: Record<string, WikidataEntity> = {};
  try {
    // No claims here: city/district entities carry hundreds of KB of them.
    entities = await wikidataEntities(qids, "labels|descriptions|sitelinks", [userLang, "en"]);
  } catch (err) {
    warnings.push(`Wikidata unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const items = rankCandidates(center, candidates, entities, {
    userLang,
    localLang,
    heading: opts.heading,
    radius,
  });
  await fillImagesFromWikidata(items.slice(0, 24));

  return { here, country, localLang, items, warnings };
}

/** Cards look dead without a photo: use the Wikidata image (P18) where we have nothing else. */
export async function fillImagesFromWikidata(items: Array<{ image?: string; wikidata?: string }>): Promise<void> {
  const missing = items.filter((i) => !i.image && i.wikidata);
  if (!missing.length) return;
  try {
    const entities = await wikidataEntities(missing.map((i) => i.wikidata!), "claims");
    for (const item of missing) {
      const file = claimValues(entities[item.wikidata!], "P18")[0];
      if (typeof file === "string") item.image = commonsThumb(file, 480);
    }
  } catch {
    // Images are decoration; a card without one is still useful.
  }
}
