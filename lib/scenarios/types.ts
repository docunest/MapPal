// Scenario pipeline types (docs/PLAN.md → "Agent pipeline", "Scenarios and
// regions"). A scenario version = the owner's prompt (plain words, read by
// the AI top-down agent) + this structured config (read by code).

export type Tag = [key: string, value: string];

export interface BrandTier {
  /** 1 = best (e.g. hypermarkets / big-box DIY), higher = less preferred. */
  tier: number;
  brands: string[];
}

export interface ScenarioConfig {
  /** Shown in the UI and given to the AI, e.g. "construction / hardware store". */
  categoryLabel: string;
  /** OSM tags that are this kind of place (bottom-up base query). */
  osmTags: Tag[];
  /**
   * Name fragments in local languages (case-insensitive regex pieces), e.g.
   * "ferreter", "drogaria". A shop whose name matches is a candidate even
   * with another shop tag — but needs checking (could be mislabelled).
   */
  nameKeywords: string[];
  /** Brand tiers per country ("ES", "PT"); "*" applies everywhere. Seeds for the top-down agent. */
  brands: Record<string, BrandTier[]>;
  /** Tier for places that match no brand, by tag ("shop=supermarket" → 4). Missing = lastTier. */
  tagTier: Record<string, number>;
  /** Tier for anything else (keyword-only matches etc.). */
  lastTier: number;
  /** Labels per tier for the UI, e.g. {1: "Big-box DIY"}. */
  tierLabels: Record<number, string>;
  /** How many extra km a place of this tier is worth driving vs. the lowest tier. */
  tierBonusKm: Record<number, number>;
  /** Tiers counted as "big stores" (kept on the map with a red cross when closed today). */
  bigTiers: number[];
  /** Tags whose match is uncertain → the validator asks the AI, e.g. "shop=variety_store". */
  uncertainTags: string[];
  /** Max places per output tier. */
  perTier: number;
}

/** What the top-down agent produced for one area (ISO 3166-2) — or the config seeds. */
export interface TopDownPlan {
  brands: BrandTier[];
  keywords: string[];
  /** Extra OSM tags the AI suggests for this area (validated against a safe list). */
  extraTags: Tag[];
  by: string; // "ai:<model>" | "defaults"
  note?: string;
}

/** How a candidate was found — kept for the evidence trail. */
export type MatchReason =
  | { by: "tag"; tag: string }
  | { by: "brand"; brand: string; tier: number; via: "brand-tag" | "name" }
  | { by: "keyword"; keyword: string }
  | { by: "frequent-name"; name: string; count: number };

export interface EvidenceItem {
  /** "osm" for map data, "rules" for derived facts, "ai:<model>" for AI verdicts. */
  source: string;
  text: string;
  url?: string;
}

export type Verdict = "real" | "stale" | "fake" | "unverified";

/** One validated, ranked place in a cached result (snapshot — no joins needed to render). */
export interface ResultItem {
  key: string; // "osm:node/123"
  poiId?: string;
  name: string;
  brand?: string;
  lat: number;
  lng: number;
  kind: string; // e.g. "shop=doityourself"
  tier: number;
  tierLabel: string;
  big: boolean;
  openingHours?: string;
  address?: string;
  phone?: string;
  website?: string;
  verdict: Verdict;
  /** Verdict came from an AI model (always labelled AI in the UI). */
  verdictByAi: boolean;
  evidence: EvidenceItem[];
  matchedBy: MatchReason[];
  /** OSM element last edited (ISO date), when known. */
  lastEdited?: string;
  sources: Array<{ source: string; url?: string }>;
}

export interface PipelineNote {
  step: "top-down" | "bottom-up" | "validator" | "ai";
  status: "ok" | "empty" | "skipped" | "failed" | "capped";
  message: string;
}

export interface PipelineOutput {
  items: ResultItem[];
  /** Candidates the validator dropped, with why — shown on request, never silently lost. */
  dropped: Array<{ key: string; name: string; reason: string; lat: number; lng: number }>;
  plan: TopDownPlan;
  notes: PipelineNote[];
  aiTokensIn: number;
  aiTokensOut: number;
}
