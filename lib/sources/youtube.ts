// YouTube: search links (no API key, no quota) — videos of the place, its
// history, and how it works / how what's made there is made.
import { classifyText, kindBySlug } from "../nearby/sightKinds";
import { factsFor } from "./wikidata";
import type { Source } from "./types";

const search = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/**
 * The "how it's made" topic: Wikidata's product beats our kind ("how steel
 * is made" for a steelworks, "how bituminous coal is mined" for a mine);
 * Wikidata's "instance of" refines a generic kind (a "factory" Wikidata
 * calls an ironworks).
 */
export function howQuery(kindSlug: string | undefined, product?: string, instanceOf: string[] = []): string | undefined {
  const generic = !kindSlug || kindSlug === "factory" || kindSlug === "landmark" || kindSlug === "industrial-area";
  const refined = generic
    ? instanceOf.map((l) => classifyText(undefined, l)?.slug).find((s) => s && s !== "factory" && s !== "landmark" && kindBySlug(s)?.how)
    : undefined;
  const slug = refined ?? kindSlug;
  const extracted = slug === "mine" || slug === "quarry";
  if (product) return `how ${product.toLowerCase()} is ${extracted ? "mined" : "made"}`;
  return kindBySlug(slug)?.how;
}

export const youtubeSource: Source = {
  meta: {
    id: "youtube",
    label: "YouTube",
    type: "videos",
    cost: "free",
    ai: false,
    homepage: "https://www.youtube.com",
    description: "Video searches: the place itself, its history, and how it works / how it's made.",
    priority: 50,
  },
  configured: () => true,
  async details(place) {
    if (place.mode !== "sight") return [];
    const info = place.wikidata ? await factsFor(place.wikidata, ["en"]).catch(() => undefined) : undefined;
    const how = howQuery(place.kind, info?.product, info?.instanceOf);
    const localName = place.wiki.find((w) => place.localLangs.includes(w.lang))?.title ?? place.name;
    const videos = [
      { label: "Videos of this place", query: localName, url: search(localName) },
      { label: "Its history", query: `${place.name} history`, url: search(`${place.name} history`) },
    ];
    if (how) {
      videos.push({ label: "How it works / how it's made", query: how, url: search(how) });
      videos.push({ label: "Explained for kids", query: `${how} for kids`, url: search(`${how} for kids`) });
    }
    return [{ id: "youtube:videos", source: "youtube", title: "Videos", section: { kind: "videos", videos } }];
  },
};
