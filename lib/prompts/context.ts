// Fill a template's placeholders for one place. Everything here is about
// the place (its own coordinates, address, neighbours, public text) — the
// PlaceRef carries no user position, and there's no placeholder for one.
import { distanceMeters } from "../geo";
import { reverseAddress } from "../nominatim";
import { wikipediaNearby } from "../wikimedia";
import { kindBySlug } from "../nearby/sightKinds";
import { LANGUAGE_NAMES } from "../nearby/languages";
import type { DetailBlock, PlaceRef, Source, SourceContext } from "../sources/types";
import type { PromptVars } from "./placeholders";

const MAX_SOURCE_CHARS = 9000;

export function blocksToText(blocks: DetailBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const s = b.section;
    if (s.kind === "article") {
      parts.push(`[Wikipedia, ${s.lang}] ${s.title}\n${s.lead}\n${s.sections.map((x) => `${x.heading}: ${x.text}`).join("\n")}`);
    } else if (s.kind === "concept") {
      parts.push(`[Wikipedia, general article] ${s.title}\n${s.lead}`);
    } else if (s.kind === "facts") {
      parts.push(`[Wikidata facts]\n${s.facts.map((f) => `${f.label}: ${f.value}`).join("\n")}`);
    }
  }
  const text = parts.join("\n\n");
  return text.length > MAX_SOURCE_CHARS ? `${text.slice(0, MAX_SOURCE_CHARS)}…` : text;
}

async function nearbyObjects(place: PlaceRef): Promise<string> {
  const langs = [...new Set([place.userLang, ...place.localLangs])];
  const lists = await Promise.all(langs.map((l) => wikipediaNearby(l, place, 500, 15).catch(() => [])));
  const own = new Set(place.wiki.map((w) => w.title));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const p of lists.flat().sort((a, b) => a.distance - b.distance)) {
    if (own.has(p.title) || (place.wikidata && p.wikidata === place.wikidata)) continue;
    const key = p.wikidata ?? p.title;
    if (seen.has(key) || distanceMeters(place, p) < 15) continue;
    seen.add(key);
    lines.push(`${p.title}${p.description ? ` — ${p.description}` : ""} (${Math.round(p.distance)} m)`);
    if (lines.length >= 8) break;
  }
  return lines.length ? lines.join("; ") : "nothing notable recorded";
}

export function languageName(code: string): string {
  if (LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code];
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export async function promptVars(place: PlaceRef, textSources: Source[], ctx: SourceContext): Promise<PromptVars> {
  const [address, nearby, blocks] = await Promise.all([
    reverseAddress(place, place.userLang).catch(() => undefined),
    nearbyObjects(place),
    Promise.all(textSources.map((s) => s.details!(place, ctx).catch(() => [] as DetailBlock[]))).then((b) => b.flat()),
  ]);
  const localName = place.wiki.find((w) => place.localLangs.includes(w.lang))?.title;
  return {
    "place.name": place.name,
    "place.local_name": localName && localName !== place.name ? localName : place.name,
    "place.kind": kindBySlug(place.kind)?.label ?? place.kind ?? "place",
    "place.lat": place.lat.toFixed(5),
    "place.lng": place.lng.toFixed(5),
    "place.address": address ?? "unknown",
    "nearby.objects": nearby,
    "sources.text": blocksToText(blocks) || "No public text found about this place.",
    language: languageName(place.userLang),
  };
}
