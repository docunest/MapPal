// A category is a config you write once (per the plan's Stage 2) and every
// tile gets scanned against it. Keep rules explicit here instead of in prose
// so coverage stays checkable: "tile 14, waterfalls" means "these OSM tags,
// these phrases" ran, not "the agent looked around".

export type OverpassElementType = "node" | "way" | "relation";

export interface OverpassTagFilter {
  // Rendered as ["key"="value"], or ["key"] if value is omitted.
  key: string;
  value?: string;
}

export interface CategoryDef {
  slug: string;
  label: string;
  // Plain-language rule for what counts, and what doesn't — this is what an
  // LLM verification pass checks candidates against later.
  description: string;
  include: string[];
  exclude: string[];
  elementTypes: OverpassElementType[];
  // Each filter is OR'd together (a candidate matches ANY of these tags).
  overpassFilters: OverpassTagFilter[];
  // Local-language search phrases for the web-search collector (Phase 2+).
  searchPhrases: string[];
  extractFields: string[];
}
