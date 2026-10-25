// Prompt templates may only use these placeholders (docs/PLAN.md §7b/7d).
// All of them describe the PLACE — there is deliberately no placeholder for
// the family's own position, route, saved list or anything personal, so a
// template edit can't leak it.

export const PLACEHOLDERS = {
  "place.name": "Name of the place (reader's language where known)",
  "place.local_name": "Name in the local language, if different",
  "place.kind": "What kind of thing it is, e.g. \"Steelworks\", \"Fish auction / market\"",
  "place.lat": "Latitude of the place itself",
  "place.lng": "Longitude of the place itself",
  "place.address": "Street address of the place (OpenStreetMap)",
  "nearby.objects": "Other notable things within ~500 m of the place",
  "sources.text": "Public text about the place: Wikipedia extracts and Wikidata facts",
  language: "Language to answer in, e.g. \"English\"",
} as const;

export type PlaceholderName = keyof typeof PLACEHOLDERS;
export type PromptVars = Record<PlaceholderName, string>;

const TOKEN = /\{\{\s*([a-z_.]+)\s*\}\}/g;

/** Names used in a template that aren't allowed. Empty = valid. */
export function unknownPlaceholders(template: string): string[] {
  const bad = new Set<string>();
  for (const m of template.matchAll(TOKEN)) if (!(m[1] in PLACEHOLDERS)) bad.add(m[1]);
  return [...bad];
}

export function renderPrompt(template: string, vars: PromptVars): string {
  const bad = unknownPlaceholders(template);
  if (bad.length) throw new Error(`Unknown placeholder(s): ${bad.map((b) => `{{${b}}}`).join(", ")}`);
  return template.replace(TOKEN, (_, name: PlaceholderName) => vars[name] ?? "");
}
