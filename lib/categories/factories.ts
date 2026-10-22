import type { CategoryDef } from "./types";

export const factories: CategoryDef = {
  slug: "factories",
  label: "Factories & industrial sites",
  description:
    "Any factory, works, or industrial plant — active or disused/abandoned. For disused ones, flag whether a nearby source (urbex post, forum, blog) says it's accessible.",
  include: [
    "active factories/plants (for the 'what's that building' drive-by list)",
    "disused/abandoned factories or works, especially ones with urbex posts about access",
  ],
  exclude: ["pure office buildings with no plant/works tag", "retail/warehouse-only sites"],
  elementTypes: ["node", "way"],
  overpassFilters: [
    { key: "man_made", value: "works" },
    { key: "disused:man_made", value: "works" },
    { key: "abandoned:man_made", value: "works" },
    { key: "building", value: "industrial" },
  ],
  searchPhrases: [
    "fábrica abandonada {place}",
    "nave industrial abandonada {place} acceso",
    "urbex {place} fábrica",
  ],
  extractFields: [
    "status (active/disused)",
    "product/operator if known",
    "accessibility note + source",
  ],
};
