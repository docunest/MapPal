// Every pluggable source the app knows about. Adding a tool = write a module
// implementing `Source` (lib/sources/types.ts) and list it here; the
// orchestrators and the /sources page pick it up automatically.
import { commonsSource } from "./commons";
import { nominatimSource } from "./nominatim";
import { osmSource } from "./osm";
import { photonSource } from "./photon";
import { wikidataSource } from "./wikidata";
import { wikipediaSource } from "./wikipedia";
import { youtubeSource } from "./youtube";
import type { Capability, Source, SourceId } from "./types";

export const ALL_SOURCES: Source[] = [
  osmSource,
  photonSource,
  wikipediaSource,
  wikidataSource,
  commonsSource,
  youtubeSource,
  nominatimSource,
];

export function sourceById(id: string): Source | undefined {
  return ALL_SOURCES.find((s) => s.meta.id === id);
}

export function withCapability(cap: Capability, sources: Source[] = ALL_SOURCES): Source[] {
  return sources.filter((s) => typeof s[cap] === "function").sort((a, b) => a.meta.priority - b.meta.priority);
}

export function isSourceId(id: string): id is SourceId {
  return ALL_SOURCES.some((s) => s.meta.id === id);
}
