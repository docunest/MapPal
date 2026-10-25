// Deep dive: everything worth knowing about one thing a kid pointed at —
// the story (Wikipedia), hard facts (Wikidata), photos (Commons), and
// videos: about the place itself, its history, and how what's made there is
// made. Works for Lens items and Scout spots alike.
import type { LatLng } from "../geo";
import {
  claimValues,
  commonsCategoryPhotos,
  commonsPhotosNear,
  commonsThumb,
  entityDescription,
  entityLabel,
  wikidataEntities,
  wikipediaArticle,
  wikipediaLanglink,
  wikipediaUrl,
  type CommonsPhoto,
  type WikiArticle,
  type WikidataEntity,
  type WikidataSnakValue,
} from "../wikimedia";
import type { WikiRef } from "./lens";
import { classifyDescription } from "./lensKinds";

// Per kind of thing: a general article ("about steel mills in general", for
// places with no article of their own) and what to search YouTube for.
const TOPICS: Record<string, { concept?: string; how?: string }> = {
  steelworks: { concept: "Steel mill", how: "how steel is made" },
  factory: { concept: "Factory", how: "how a factory works" },
  "power-plant": { concept: "Power station", how: "how a power station makes electricity" },
  brewery: { concept: "Brewery", how: "how beer is made" },
  mine: { concept: "Mining", how: "how a coal mine works" },
  "old-mine": { concept: "Mining", how: "how mines worked in the past" },
  quarry: { concept: "Quarry", how: "how a quarry works" },
  gasholder: { concept: "Gas holder", how: "how gas holders gasometers worked" },
  chimney: { concept: "Chimney", how: "why factories have tall chimneys" },
  silo: { concept: "Silo", how: "how grain silos work" },
  "industrial-area": { concept: "Industrial park", how: "how factories work" },
  "railway-station": { concept: "Train station", how: "how railway signalling works" },
  "railway-line": { concept: "Railway line", how: "how railways are built" },
  "historic-train": { concept: "Steam locomotive", how: "how a steam locomotive works" },
  "cable-car": { concept: "Aerial tramway", how: "how cable cars work" },
  gorge: { concept: "Canyon", how: "how gorges and canyons form" },
  waterfall: { concept: "Waterfall", how: "how waterfalls form" },
  peak: { concept: "Mountain", how: "how mountains form" },
  glacier: { concept: "Glacier", how: "how glaciers move" },
  cliff: { concept: "Cliff", how: "how cliffs and rock formations form" },
  arch: { concept: "Natural arch", how: "how natural rock arches form" },
  cave: { concept: "Cave", how: "how caves form" },
  spring: { concept: "Spring (hydrology)", how: "where spring water comes from" },
  "hot-spring": { concept: "Hot spring", how: "how hot springs work" },
  river: { concept: "River", how: "how rivers shape the land" },
  canal: { concept: "Canal", how: "how canal locks work" },
  lake: { concept: "Lake", how: "how lakes form" },
  dam: { concept: "Dam", how: "how dams work" },
  weir: { concept: "Lock (water navigation)", how: "how canal locks work" },
  lighthouse: { concept: "Lighthouse", how: "how lighthouses work" },
  mill: { concept: "Watermill", how: "how a watermill windmill works" },
  "water-tower": { concept: "Water tower", how: "how water towers work" },
  bridge: { concept: "Bridge", how: "how bridges are built" },
  "historic-bridge": { concept: "Arch bridge", how: "how old stone bridges were built" },
  aqueduct: { concept: "Aqueduct (water supply)", how: "how roman aqueducts worked" },
  "viewing-tower": { concept: "Observation tower" },
  "lookout-tower": { concept: "Observation tower" },
  "tv-tower": { concept: "Radio masts and towers", how: "how TV towers work" },
  tower: { concept: "Tower" },
  airport: { concept: "Airport", how: "how airports work" },
  castle: { concept: "Castle", how: "how medieval castles were built" },
  ruins: { concept: "Ruins", how: "how archaeologists study ruins" },
  fort: { concept: "Fortification", how: "how forts defended against attacks" },
  archaeology: { concept: "Archaeological site", how: "how archaeologists dig" },
  monastery: { concept: "Monastery", how: "what life in a medieval monastery was like" },
  "fish-market": { concept: "Fish market", how: "how a fish auction works" },
  market: { concept: "Marketplace" },
  museum: { concept: "Museum" },
  viewpoint: { concept: "Scenic viewpoint" },
  "lost-place": { concept: "Urban exploration" },
  mural: { concept: "Mural", how: "how giant murals are painted" },
};

// The Wikidata facts a curious kid (or parent) actually asks about.
const FACT_PROPS: Array<[string, string]> = [
  ["P31", "What it is"],
  ["P571", "Started"],
  ["P1619", "Opened"],
  ["P576", "Closed"],
  ["P1056", "Makes"],
  ["P452", "Industry"],
  ["P127", "Owner"],
  ["P137", "Run by"],
  ["P2048", "Height"],
  ["P2043", "Length"],
  ["P2044", "Elevation"],
  ["P2109", "Power output"],
  ["P1128", "Workers"],
  ["P1082", "Population"],
  ["P177", "Crosses"],
  ["P403", "Flows into"],
  ["P186", "Made of"],
  ["P84", "Architect"],
  ["P149", "Style"],
  ["P138", "Named after"],
  ["P1435", "Protected as"],
];

const UNITS: Record<string, string> = {
  Q11573: "m",
  Q828224: "km",
  Q712226: "km²",
  Q25343: "m²",
  Q191118: "t",
  Q6982035: "MW",
  Q3332095: "km/h",
};

/** "en:Lower Vítkovice|cs:Dolní oblast Vítkovice" → WikiRef[] (the deep-dive URL format). */
export function parseWikiParam(raw: string | null): WikiRef[] {
  return (raw ?? "")
    .split("|")
    .map((part) => /^([a-z-]{2,12}):(.+)$/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ lang: m[1], title: m[2] }));
}

export interface DeepDiveRequest {
  name: string;
  lat?: number;
  lng?: number;
  kind?: string;
  wikidata?: string;
  wiki: WikiRef[];
  userLang: string;
  localLang?: string;
}

export interface DeepDiveVideo {
  label: string;
  query: string;
  url: string;
}

export interface DeepDive {
  title: string;
  description?: string;
  hero?: string;
  article?: WikiArticle;
  /** Set when the article isn't in the reader's language. */
  translateUrl?: string;
  /** Richer local-language article, offered as "read more (translated)". */
  otherArticles: Array<{ lang: string; title: string; url: string; translateUrl?: string }>;
  concept?: { title: string; url: string; lead: string };
  facts: Array<{ label: string; value: string }>;
  photos: CommonsPhoto[];
  videos: DeepDiveVideo[];
  howQuery?: string;
  links: Array<{ label: string; url: string }>;
}

function formatTime(v: WikidataSnakValue): string | undefined {
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(v.time ?? "");
  if (!m) return undefined;
  const year = Number(m[2]);
  return m[1] === "-" ? `${year} BC` : String(year);
}

function formatQuantity(v: WikidataSnakValue): string | undefined {
  if (!v.amount) return undefined;
  const n = Number(v.amount);
  const unit = UNITS[(v.unit ?? "").split("/").pop() ?? ""] ?? "";
  return `${n.toLocaleString("en")}${unit ? ` ${unit}` : ""}`;
}

const youtube = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
export const translateUrl = (url: string, to: string) =>
  `https://translate.google.com/translate?sl=auto&tl=${to}&u=${encodeURIComponent(url)}`;

export function buildVideos(name: string, localName: string | undefined, howQuery: string | undefined): DeepDiveVideo[] {
  const v: DeepDiveVideo[] = [
    { label: "Videos of this place", query: localName ?? name, url: youtube(localName ?? name) },
    { label: "Its history", query: `${name} history`, url: youtube(`${name} history`) },
  ];
  if (howQuery) {
    v.push({ label: "How it works / how it's made", query: howQuery, url: youtube(howQuery) });
    v.push({ label: "Explained for kids", query: `${howQuery} for kids`, url: youtube(`${howQuery} for kids`) });
  }
  return v;
}

async function factsFor(entity: WikidataEntity | undefined, langs: string[]): Promise<{
  facts: Array<{ label: string; value: string }>;
  product?: string;
  instanceOf?: string;
  instanceOfAll: string[];
}> {
  if (!entity) return { facts: [], instanceOfAll: [] };
  const refIds = new Set<string>();
  for (const [p] of FACT_PROPS) {
    for (const v of claimValues(entity, p).slice(0, 3)) {
      if (typeof v === "object" && v.id) refIds.add(v.id);
    }
  }
  const refs = refIds.size ? await wikidataEntities([...refIds], "labels", langs).catch(() => ({})) : {};
  const label = (id: string) => entityLabel((refs as Record<string, WikidataEntity>)[id], langs);

  const facts: Array<{ label: string; value: string }> = [];
  let product: string | undefined;
  let instanceOf: string | undefined;
  let instanceOfAll: string[] = [];
  for (const [p, name] of FACT_PROPS) {
    const values = claimValues(entity, p)
      .slice(0, 3)
      .map((v) => {
        if (typeof v === "string") return v;
        if (v.id) return label(v.id);
        if (v.time) return formatTime(v);
        if (v.amount) return formatQuantity(v);
        return v.text;
      })
      .filter((v): v is string => !!v);
    if (!values.length) continue;
    if (p === "P1056") product = values[0];
    if (p === "P31") {
      instanceOf = values[0];
      instanceOfAll = values;
    }
    facts.push({ label: name, value: values.join(", ") });
  }
  return { facts, product, instanceOf, instanceOfAll };
}

export async function buildDeepDive(req: DeepDiveRequest): Promise<DeepDive> {
  const { userLang } = req;
  const langs = [...new Set([userLang, "en"])];

  let entity: WikidataEntity | undefined;
  if (req.wikidata) {
    const entities = await wikidataEntities([req.wikidata], "labels|descriptions|claims|sitelinks", langs).catch(
      () => ({}) as Record<string, WikidataEntity>,
    );
    entity = entities[req.wikidata];
  }

  // Candidate articles, reader's language first, then the local one.
  const refs: WikiRef[] = [];
  const addRef = (r: WikiRef | undefined) => {
    if (r && !refs.some((x) => x.lang === r.lang)) refs.push(r);
  };
  for (const lang of [userLang, req.localLang, "en"]) {
    if (!lang) continue;
    const sl = entity?.sitelinks?.[`${lang}wiki`];
    if (sl) addRef({ lang, title: sl.title });
    addRef(req.wiki.find((w) => w.lang === lang));
  }
  req.wiki.forEach(addRef);

  const primaryRef = refs[0];
  const [article, factInfo] = await Promise.all([
    primaryRef ? wikipediaArticle(primaryRef.lang, primaryRef.title).catch(() => null) : Promise.resolve(null),
    factsFor(entity, langs),
  ]);

  const otherArticles = refs.slice(1).map((r) => {
    const url = wikipediaUrl(r.lang, r.title);
    return { lang: r.lang, title: r.title, url, translateUrl: r.lang !== userLang ? translateUrl(url, userLang) : undefined };
  });

  // Wikidata's "instance of" is often more specific than our map-tag kind
  // (a "factory" that Wikidata knows is an ironworks).
  const refinedKind = factInfo.instanceOfAll
    .map((label) => classifyDescription(label)?.slug)
    .find((slug) => slug && slug !== "factory" && slug !== "landmark" && TOPICS[slug]?.how);
  const kind = refinedKind && (!req.kind || req.kind === "factory" || req.kind === "landmark") ? refinedKind : req.kind;
  const topic = kind ? TOPICS[kind] : undefined;
  const extracted = kind === "mine" || kind === "old-mine" || kind === "quarry";
  // "How it's made" follows the product when we know it (steel, beer, coal).
  const howQuery = factInfo.product
    ? `how ${factInfo.product.toLowerCase()} is ${extracted ? "mined" : "made"}`
    : topic?.how ?? (factInfo.instanceOf ? `how does a ${factInfo.instanceOf.toLowerCase()} work` : undefined);

  // No article of its own: explain the kind of thing instead.
  let concept: DeepDive["concept"];
  if (!article && topic?.concept) {
    const title =
      userLang === "en" ? topic.concept : await wikipediaLanglink("en", topic.concept, userLang).catch(() => null);
    const lang = title && userLang !== "en" ? userLang : "en";
    const conceptArticle = await wikipediaArticle(lang, title ?? topic.concept).catch(() => null);
    if (conceptArticle) concept = { title: conceptArticle.title, url: conceptArticle.url, lead: conceptArticle.lead };
  }

  // Photos: the item's own Commons category if it has one, else whatever's
  // been photographed right there.
  const commonsCat = claimValues(entity, "P373")[0];
  let photos: CommonsPhoto[] = [];
  if (typeof commonsCat === "string") {
    photos = await commonsCategoryPhotos(commonsCat, 16).catch(() => []);
  }
  if (photos.length < 4 && req.lat !== undefined && req.lng !== undefined) {
    const near = await commonsPhotosNear({ lat: req.lat, lng: req.lng } as LatLng, 250, 16).catch(() => []);
    photos = [...photos, ...near.filter((p) => !photos.some((x) => x.file === p.file))];
  }
  photos = photos.slice(0, 16);

  const p18 = claimValues(entity, "P18")[0];
  const hero = article?.image ?? (typeof p18 === "string" ? commonsThumb(p18, 1000) : undefined) ?? photos[0]?.thumb;

  const title = entity?.labels?.[userLang]?.value ?? article?.title ?? req.name;
  const localName = req.wiki.find((w) => w.lang === req.localLang)?.title;

  const links: DeepDive["links"] = [];
  if (article) links.push({ label: `Wikipedia (${article.lang})`, url: article.url });
  if (req.wikidata) links.push({ label: "Wikidata", url: `https://www.wikidata.org/wiki/${req.wikidata}` });
  if (typeof commonsCat === "string") {
    links.push({ label: "All photos (Commons)", url: `https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(commonsCat)}` });
  }
  links.push({ label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(localName ?? title)}` });
  if (req.lat !== undefined && req.lng !== undefined) {
    links.push({ label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${req.lat},${req.lng}` });
  }

  return {
    title,
    description: entityDescription(entity, [userLang]) ?? article?.description,
    hero,
    article: article ?? undefined,
    translateUrl: article && article.lang !== userLang ? translateUrl(article.url, userLang) : undefined,
    otherArticles,
    concept,
    facts: factInfo.facts,
    photos,
    videos: buildVideos(title, localName && localName !== title ? localName : undefined, howQuery),
    howQuery,
    links,
  };
}
