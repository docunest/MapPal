// Review app (/review): the cards people swipe and the filters they choose.
// Pure types, no IO.

export type VoteValue = "like" | "maybe" | "nope" | "never";
export const VOTES: readonly VoteValue[] = ["like", "maybe", "nope", "never"];

export interface ReviewPhoto {
  url: string;
  credit?: string;
  page?: string;
}

/** What the agent said (AI output, labelled so in the UI). */
export interface AgentView {
  verdict: string;
  confidence: number;
  keep: boolean;
  relevant: boolean;
  summary: string;
  vibe?: string;
  foodTags?: string[];
  kitchenHours?: string;
  peakTimes?: string;
  risks?: Array<{ flag: string; note: string }>;
  prices?: Array<{ item: string; price: number; size?: string; currency?: string }>;
  access?: string;
  howToGetThere?: string;
  parking?: string;
  safety?: string;
  evidence: Array<{ kind: string; url?: string; note: string }>;
  reviewedAt: string;
  runId: string;
}

export interface ReviewPlace {
  key: string; // OSM ref
  name: string;
  category: string; // a use case (cafes, bars, exploration…); the filter takes a group (food) as all of its use cases
  kind: string; // cafe, bar, cave, ruins…
  lat: number;
  lng: number;
  checked: boolean; // the agent reviewed it
  agent?: AgentView;
  tags: Record<string, string>; // OSM facts worth showing
  photo?: ReviewPhoto;
  parking?: { name?: string; distanceM: number };
  googlePlaceId?: string;
  rawTags?: Record<string, string>; // server-side only
  // Filled per request:
  distanceM?: number;
  bearing?: number;
  votes?: Record<string, VoteValue>; // voter → vote
  sentAt?: string; // sent to the car's navigation
  visitedAt?: string; // a GPS fix within 75 m
}

export type PoolScope = "checked" | "checked-all" | "everything";
export type MineFilter = "unvoted" | "like" | "maybe" | "nope" | "never" | "any";

export interface Scope {
  lat: number;
  lng: number;
  radiusKm: number | null; // null = anywhere
  categories: string[]; // empty = all
  pool: PoolScope; // checked = kept by the agent; checked-all = also the ones it didn't keep; everything = + unchecked
  voter: string;
  mine: MineFilter;
  other?: { voter: string; status: "voted" | "like" | "unvoted" };
}
