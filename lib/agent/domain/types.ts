// Phase 0 agent run (docs/PLAN.md → "Hybrid agent backend — Phase 0"): the
// shapes the server and the agent exchange. Pure types, no IO.
import type { LatLng } from "@/lib/geo";

// A use case (its rules live in mappal_rule "usecase:<name>"): "cafes", "exploration", or any added later.
export type AgentCategory = string;

export type OsmTags = Record<string, string>;

/** An OSM element reduced to what the rules need. */
export interface OsmThing extends LatLng {
  ref: string; // "node/123"
  tags: OsmTags;
}

/** One place the run may look at closely. Stored in the run's plan. */
export interface Candidate extends LatLng {
  id: string; // "c12" (cafes) / "e3" (exploration): short, the agent writes it back
  category: AgentCategory;
  family?: string; // the top of its use-case tree (food, exploration…): decides Wikipedia lookups and the parking line
  osmRef: string;
  name: string;
  kind: string; // cafe, bar, restaurant… / cave, mine, ruins…
  score: number;
  why: string[]; // the rule points that ranked it
  near: string; // "420 m from Peniche"
  circle?: string; // cafes: which zone circle (town) it belongs to
  tile: string; // geohash-5
  tags: OsmTags; // the OSM tags worth showing (trimmed)
  parking?: { name?: string; distanceM: number; tags: OsmTags; osmRef: string };
  served?: boolean;
  // Filled when served, kept for saving the review (no Google content).
  googlePlaceId?: string;
  photo?: { source: string; page?: string; credit?: string; url?: string }; // url: the image itself (Commons/website only)
}

export interface Dropped {
  name: string;
  osmRef: string;
  reason: string;
  lat?: number;
  lng?: number;
}

export interface ZoneTown extends LatLng {
  name: string;
  place: string;
  population?: number;
  distanceM: number;
  radiusM: number;
}

export interface Zone {
  target: LatLng & { label: string; source: string; at?: string };
  why: string;
  campsite: LatLng & { name: string; kind: string; osmRef?: string; distanceM: number };
  towns: ZoneTown[];
  cafeCircles: Array<LatLng & { radiusM: number; label: string }>;
  explore: LatLng & { radiusM: number };
  tiles: { cafes: string[]; exploration: string[] };
}

export interface Caps {
  tokens: number; // content the server hands the agent (text + images), estimated tokens
  places: number; // places sent to the agent in one pull (all use cases)
  pages: number; // fetch_page calls
  images: number; // images sent (photos + menus)
  googleDetails: number;
  googlePhotos: number;
  batchSize: number;
}

export interface Counters {
  tokens: number;
  textTokens: number;
  imageTokens: number;
  pages: number;
  images: number;
  googleDetails: number;
  googlePhotos: number;
  served: Record<string, number>; // per use case
  batches: number;
  reviews: number;
  kept: number;
}

export const emptyCounters = (): Counters => ({
  tokens: 0,
  textTokens: 0,
  imageTokens: 0,
  pages: 0,
  images: 0,
  googleDetails: 0,
  googlePhotos: 0,
  served: {},
  batches: 0,
  reviews: 0,
  kept: 0,
});

export type RunStatus = "planned" | "running" | "capped" | "done" | "cancelled";

export interface PlanCategory {
  found: number; // OSM elements the query returned
  dropped: Dropped[]; // by the cheap rules, with the reason
  cached: string[]; // names reviewed within the freshness window: not checked again
  candidates: Candidate[]; // ranked, cheapest first; only the first `caps[category]` are served
  overCap: number; // survivors not checked because of the place cap
  // Those survivors themselves (ids b1…, ≤ 400): unchecked places the review app can show on request.
  backlog?: Candidate[];
}

export interface Plan {
  zone: Zone;
  categories: Record<string, PlanCategory>;
  estimate: Estimate;
  google: boolean; // Google key configured when planned
  country?: string; // ISO code from Nominatim
  lang: string; // language for Google answers: "pt" in Portugal, else "es"
  notes: string[];
}

export interface Estimate {
  servedTokens: number; // what the server expects to hand over (capped by caps.tokens)
  pages: number;
  images: number;
  googleDetails: number;
  googlePhotos: number;
  agentTurns: number;
  outputTokens: number;
  cachedRereadTokens: number;
  text: string;
}
