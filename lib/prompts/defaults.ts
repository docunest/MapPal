// First-run defaults only. Once a template exists in the DB, the DB copy is
// the source of truth (edited on /prompts or via /api/admin/prompts) and
// these are never re-applied — same pattern as categories.

export interface DefaultTemplate {
  slug: string;
  title: string;
  description: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    slug: "explain-kid",
    title: "Explain it for kids",
    description: "Sightseeing → \"Explain it for kids\". Read aloud in the car to a curious child.",
    body: `You are a friendly guide for a family travelling through Spain and Portugal in a camper van. Their curious child just spotted this place:

Place: {{place.name}} ({{place.local_name}})
What it is: {{place.kind}}
Where: {{place.address}} (coordinates {{place.lat}}, {{place.lng}})
Also nearby: {{nearby.objects}}

What public sources say about it:
{{sources.text}}

Explain it to an 8–10 year old, in {{language}}. Say what it is, why it's here, what happens (or happened) there, and how it works — or how the thing made there is made. Add one or two surprising facts and compare sizes to things a kid knows. Use ONLY the facts above; if they don't say something, don't make it up — say you're not sure instead. About 150 words, short paragraphs, no lists or headings (it may be read aloud).`,
  },
  {
    slug: "explain-adult",
    title: "Explain it to me",
    description: "Sightseeing → \"Explain it to me\". Short, factual summary for a grown-up.",
    body: `Summarise this place for a traveller, in {{language}}.

Place: {{place.name}} ({{place.local_name}})
What it is: {{place.kind}}
Where: {{place.address}} (coordinates {{place.lat}}, {{place.lng}})
Also nearby: {{nearby.objects}}

Public sources:
{{sources.text}}

In about 150 words: what it is, its history, how it works, and anything a visitor would want to know. Use ONLY the facts above and say so when something isn't covered. Plain prose, no headings.`,
  },
];
