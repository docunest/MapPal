// Wikidata: English (or reader's-language) names and descriptions for
// sights found in local sources, how famous they are (sitelinks), photos,
// and the hard facts in the deep dive (opened, closed, what it makes…).
import {
  claimValues,
  entityLabel,
  sitelinkCount,
  wikidataEntities,
  wikidataImagesAndFame,
  type WikidataEntity,
  type WikidataSnakValue,
} from "../wikimedia";
import type { DetailBlock, Enrichment, Source, WikiRef } from "./types";

// The facts a curious kid (or parent) actually asks about.
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
};

function formatTime(v: WikidataSnakValue): string | undefined {
  const m = /^([+-])(\d+)-/.exec(v.time ?? "");
  if (!m) return undefined;
  return m[1] === "-" ? `${Number(m[2])} BC` : String(Number(m[2]));
}

function formatQuantity(v: WikidataSnakValue): string | undefined {
  if (!v.amount) return undefined;
  const unit = UNITS[(v.unit ?? "").split("/").pop() ?? ""] ?? "";
  return `${Number(v.amount).toLocaleString("en")}${unit ? ` ${unit}` : ""}`;
}

export interface Facts {
  facts: Array<{ label: string; value: string }>;
  /** "steel", "bituminous coal" — drives the how-it's-made video search. */
  product?: string;
  instanceOf: string[];
}

export async function factsFor(qid: string, langs: string[]): Promise<Facts> {
  const entity = (await wikidataEntities([qid], "labels|claims", langs))[qid];
  if (!entity) return { facts: [], instanceOf: [] };
  const refIds = new Set<string>();
  for (const [p] of FACT_PROPS) {
    for (const v of claimValues(entity, p).slice(0, 3)) if (typeof v === "object" && v.id) refIds.add(v.id);
  }
  const refs: Record<string, WikidataEntity> = refIds.size
    ? await wikidataEntities([...refIds], "labels", langs).catch(() => ({}))
    : {};

  const facts: Facts["facts"] = [];
  let product: string | undefined;
  let instanceOf: string[] = [];
  for (const [p, name] of FACT_PROPS) {
    const values = claimValues(entity, p)
      .slice(0, 3)
      .map((v) => {
        if (typeof v === "string") return v;
        if (v.id) return entityLabel(refs[v.id], langs);
        if (v.time) return formatTime(v);
        if (v.amount) return formatQuantity(v);
        return v.text;
      })
      .filter((v): v is string => !!v);
    if (!values.length) continue;
    if (p === "P1056") product = values[0];
    if (p === "P31") instanceOf = values;
    facts.push({ label: name, value: values.join(", ") });
  }
  return { facts, product, instanceOf };
}

export const wikidataSource: Source = {
  meta: {
    id: "wikidata",
    label: "Wikidata",
    type: "facts",
    cost: "free",
    ai: false,
    homepage: "https://www.wikidata.org",
    description: "Names in your language, how famous a place is, photos, and hard facts (opened, closed, what it makes).",
    priority: 30,
  },
  configured: () => true,
  async enrich(qids, q) {
    const langs = [...new Set([q.userLang, "en"])];
    const [entities, images] = await Promise.all([
      wikidataEntities(qids, "labels|descriptions|sitelinks", langs),
      // Photos are decoration: a SPARQL hiccup must not lose the names.
      wikidataImagesAndFame(qids).catch(() => ({}) as Record<string, { image?: string }>),
    ]);
    const out: Record<string, Enrichment> = {};
    for (const [id, e] of Object.entries(entities)) {
      const wiki: WikiRef[] = [];
      for (const lang of [q.userLang, ...q.localLangs, "en"]) {
        const sl = e.sitelinks?.[`${lang}wiki`];
        if (sl && !wiki.some((w) => w.lang === lang)) wiki.push({ lang, title: sl.title });
      }
      out[id] = {
        // Only a label really in the reader's language — a fallback label is
        // just the local name again.
        label: e.labels?.[q.userLang]?.value,
        description: e.descriptions?.[q.userLang]?.value ?? e.descriptions?.en?.value,
        fame: sitelinkCount(e),
        image: (images as Record<string, { image?: string }>)[id]?.image,
        wiki,
      };
    }
    return out;
  },
  async details(place) {
    if (!place.wikidata) return [];
    const info = await factsFor(place.wikidata, [place.userLang, "en"]);
    if (!info.facts.length) return [];
    return [
      {
        id: "wikidata:facts",
        source: "wikidata",
        title: "Facts",
        url: `https://www.wikidata.org/wiki/${place.wikidata}`,
        section: { kind: "facts", facts: info.facts },
      } satisfies DetailBlock,
    ];
  },
};
