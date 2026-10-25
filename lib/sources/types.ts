// The pluggable-sources framework (docs/PLAN.md §7a). Every data tool —
// OpenStreetMap, Wikipedia, Google, DeepSeek… — is one module implementing
// `Source`. Orchestrators (lib/nearby/*) ask every enabled source that has
// a capability, merge the answers, and keep where each piece came from so
// the UI can show source tags and collect likes.
import type { LatLng } from "../geo";

export type SourceId =
  | "osm"
  | "photon"
  | "nominatim"
  | "wikipedia"
  | "wikidata"
  | "commons"
  | "youtube"
  | "google"
  | "deepseek";

export type SourceType = "places" | "address" | "encyclopedia" | "facts" | "photos" | "videos" | "reviews" | "ai";

export interface SourceMeta {
  id: SourceId;
  label: string;
  type: SourceType;
  cost: "free" | "paid";
  /** Output is written by a model, not looked up — always labelled "AI" in the UI. */
  ai: boolean;
  homepage: string;
  attribution?: string;
  /** Env vars that must be set for the source to be usable at all. */
  requiresEnv?: string[];
  description: string;
  /** Lower runs first among sources with the same capability. */
  priority: number;
  /** Lists come back nearest-first, so one call at the widest radius is enough. */
  nearestFirst?: boolean;
}

/** Where one piece of shown data came from. */
export interface Provenance {
  source: SourceId;
  url?: string;
}

// --- Utilities -------------------------------------------------------------

export const UTILITY_CATEGORIES = ["fuel", "restaurants", "groceries"] as const;
export type UtilityCategory = (typeof UTILITY_CATEGORIES)[number];

export interface UtilityPlace {
  /** Stable identity, e.g. "osm:node/123", "google:ChIJ…". */
  key: string;
  category: UtilityCategory;
  kind: string;
  kindLabel: string;
  icon: string;
  name: string;
  brand?: string;
  lat: number;
  lng: number;
  /** OSM opening_hours syntax, evaluated on the device (local time). */
  openingHours?: string;
  badges: string[];
  address?: string;
  phone?: string;
  website?: string;
  sources: Provenance[];
  /** Per-source ids, so details can be fetched from each source later. */
  refs: Partial<Record<SourceId, string>>;
}

export interface UtilitiesQuery {
  center: LatLng;
  /** Search radius per category, meters. */
  radius: Partial<Record<UtilityCategory, number>>;
}

// --- Sightseeing -----------------------------------------------------------

export interface WikiRef {
  lang: string;
  title: string;
}

/**
 * One source's view of an interesting thing. The sights orchestrator merges
 * candidates from several sources (by Wikidata id, then name + distance).
 */
export interface SightCandidate {
  key: string;
  source: SourceId;
  name?: string;
  /** Names in the local language(s), for display and matching. */
  localName?: string;
  lat: number;
  lng: number;
  /** Meters from the query point (nearest edge for rivers/railways). */
  distance: number;
  tags?: Record<string, string>;
  osm?: string;
  wikidata?: string;
  wiki?: WikiRef;
  description?: string;
  descriptionLang?: string;
  image?: string;
  url?: string;
}

export interface SightsQuery {
  center: LatLng;
  radius: number;
  userLang: string;
  /** Wikipedia language of the country we're in (es, pt, ca…). */
  localLangs: string[];
}

// --- Details ---------------------------------------------------------------

/** Everything needed to look one place up again in every source. */
export interface PlaceRef {
  key: string;
  mode: "utility" | "sight";
  name: string;
  lat: number;
  lng: number;
  kind?: string;
  category?: UtilityCategory;
  wikidata?: string;
  wiki: WikiRef[];
  refs: Partial<Record<SourceId, string>>;
  userLang: string;
  localLangs: string[];
}

export type DetailSection =
  | { kind: "article"; lang: string; title: string; lead: string; sections: Array<{ heading: string; text: string }>; translateUrl?: string }
  | { kind: "facts"; facts: Array<{ label: string; value: string }> }
  | { kind: "photos"; photos: Array<{ thumb: string; page: string }> }
  | { kind: "videos"; videos: Array<{ label: string; query: string; url: string }> }
  | { kind: "rating"; rating?: number; count?: number; priceLevel?: string; reviews: Array<{ author?: string; rating?: number; text: string; when?: string }> }
  | { kind: "hours"; lines: string[]; openNow?: boolean }
  | { kind: "fuel-prices"; prices: Array<{ type: string; price: string; updated?: string }> }
  | { kind: "address"; address: string }
  | { kind: "concept"; title: string; lead: string }
  | { kind: "ai-text"; text: string; model: string; template: string };

export interface DetailBlock {
  /** Unique within one details response, e.g. "wikipedia:es". */
  id: string;
  source: SourceId;
  title: string;
  url?: string;
  section: DetailSection;
}

/** What each source did for one request — failures are shown, not hidden. */
export interface SourceNote {
  source: SourceId;
  status: "ok" | "empty" | "skipped" | "disabled" | "not-configured" | "capped" | "failed";
  message: string;
}

// --- AI ----------------------------------------------------------------------

export interface ExplainInput {
  /** Fully rendered prompt (from a shared template — lib/prompts). */
  prompt: string;
  templateSlug: string;
}

export interface ExplainOutput {
  text: string;
  model: string;
}

// --- The plug-in contract ---------------------------------------------------

export interface SourceContext {
  usage: UsageGuard;
}

export interface UsageGuard {
  /**
   * Reserve one call of `sku` for `source`. Resolves false when the daily or
   * monthly cap is reached — the source must then skip the call.
   */
  take(source: SourceId, sku: string): Promise<boolean>;
}

export interface Source {
  meta: SourceMeta;
  /** Required env vars present (keys etc.). */
  configured(): boolean;
  utilities?(q: UtilitiesQuery, ctx: SourceContext): Promise<UtilityPlace[]>;
  sights?(q: SightsQuery, ctx: SourceContext): Promise<SightCandidate[]>;
  /** Extra facts for sights by Wikidata id. */
  enrich?(qids: string[], q: SightsQuery, ctx: SourceContext): Promise<Record<string, Enrichment>>;
  details?(place: PlaceRef, ctx: SourceContext): Promise<DetailBlock[]>;
  explain?(input: ExplainInput, ctx: SourceContext): Promise<ExplainOutput>;
}

export type Capability = "utilities" | "sights" | "enrich" | "details" | "explain";

/** What an enrichment source (Wikidata) adds to a sight it recognises. */
export interface Enrichment {
  label?: string;
  description?: string;
  /** Wikipedia sitelinks — how widely written-about (fame). */
  fame?: number;
  image?: string;
  wiki: WikiRef[];
}

/** Thrown by a source when its usage cap stops it; orchestrators report it as "capped". */
export class SourceCappedError extends Error {}
