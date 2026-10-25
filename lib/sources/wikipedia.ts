// Wikipedia: geotagged articles near a point (sights) and the article text
// for the deep dive (details). Reads the reader's language plus the local
// Wikipedias (es/pt/ca/gl/eu) — that's where Iberian sights are written up.
import {
  wikipediaArticle,
  wikipediaLanglink,
  wikipediaNearby,
  wikipediaUrl,
  type WikiArticle,
} from "../wikimedia";
import { kindBySlug } from "../nearby/sightKinds";
import { LANGUAGE_NAMES } from "../nearby/languages";
import type { DetailBlock, PlaceRef, SightCandidate, Source, WikiRef } from "./types";

export const translateUrl = (url: string, to: string) =>
  `https://translate.google.com/translate?sl=auto&tl=${to}&u=${encodeURIComponent(url)}`;

const langName = (l: string) => LANGUAGE_NAMES[l] ?? l;

/** Article candidates for a place, reader's language first, then local ones. */
export function orderedRefs(place: PlaceRef): WikiRef[] {
  const order = [place.userLang, ...place.localLangs, "en"];
  const refs = [...place.wiki].sort((a, b) => {
    const ia = order.indexOf(a.lang);
    const ib = order.indexOf(b.lang);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return refs.filter((r, i) => refs.findIndex((x) => x.lang === r.lang) === i);
}

function articleBlock(a: WikiArticle, userLang: string): DetailBlock {
  return {
    id: `wikipedia:${a.lang}`,
    source: "wikipedia",
    title: `Wikipedia (${langName(a.lang)})`,
    url: a.url,
    section: {
      kind: "article",
      lang: a.lang,
      title: a.title,
      lead: a.lead,
      sections: a.sections,
      translateUrl: a.lang !== userLang ? translateUrl(a.url, userLang) : undefined,
    },
  };
}

export const wikipediaSource: Source = {
  meta: {
    id: "wikipedia",
    label: "Wikipedia",
    type: "encyclopedia",
    cost: "free",
    ai: false,
    homepage: "https://www.wikipedia.org",
    description: "Articles about the place, in your language and the local ones (Spanish, Portuguese, Catalan, Galician, Basque).",
    priority: 20,
  },
  configured: () => true,
  async sights(q) {
    const langs = [...new Set([q.userLang, ...q.localLangs])];
    const lists = await Promise.all(
      langs.map((lang) => wikipediaNearby(lang, q.center, q.radius, 50).catch(() => [])),
    );
    return lists.flat().map(
      (p): SightCandidate => ({
        key: p.wikidata ?? `wp:${p.lang}:${p.title}`,
        source: "wikipedia",
        name: p.title.replace(/ \([^)]*\)$/, ""),
        lat: p.lat,
        lng: p.lng,
        distance: p.distance,
        wikidata: p.wikidata,
        wiki: { lang: p.lang, title: p.title },
        description: p.description,
        descriptionLang: p.lang,
        image: p.thumbnail,
        url: wikipediaUrl(p.lang, p.title),
      }),
    );
  },
  async details(place) {
    if (place.mode !== "sight") return [];
    const refs = orderedRefs(place);
    const blocks: DetailBlock[] = [];
    // Reader's language first; if that's not the local one, also the local
    // article — for Iberian sights it's usually the longer one.
    const primary = refs[0] ? await wikipediaArticle(refs[0].lang, refs[0].title).catch(() => null) : null;
    if (primary) blocks.push(articleBlock(primary, place.userLang));
    const local = refs.find((r) => r.lang !== refs[0]?.lang && place.localLangs.includes(r.lang));
    if (local) {
      const a = await wikipediaArticle(local.lang, local.title).catch(() => null);
      if (a) blocks.push(articleBlock(a, place.userLang));
    }
    if (blocks.length) return blocks;

    // No article of its own: explain the kind of thing ("steel mills in general").
    const concept = kindBySlug(place.kind)?.concept;
    if (!concept) return [];
    const title = place.userLang === "en" ? concept : await wikipediaLanglink("en", concept, place.userLang).catch(() => null);
    const lang = title && place.userLang !== "en" ? place.userLang : "en";
    const a = await wikipediaArticle(lang, title ?? concept).catch(() => null);
    return a
      ? [{ id: "wikipedia:concept", source: "wikipedia", title: `About ${a.title} in general`, url: a.url, section: { kind: "concept", title: a.title, lead: a.lead } }]
      : [];
  },
};
