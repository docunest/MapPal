import type { CategoryDef } from "./types";

export const waterfalls: CategoryDef = {
  slug: "waterfalls",
  label: "Waterfalls",
  description:
    "A natural waterfall reachable on foot or by short hike. Include dry-season-only falls but flag them.",
  include: [
    "natural waterfalls, including seasonal ones",
    "waterfalls on named rivers/streams, even if small",
  ],
  exclude: ["man-made fountains", "irrigation/dam spillways with no natural fall"],
  elementTypes: ["node", "way"],
  overpassFilters: [
    { key: "waterway", value: "waterfall" },
    { key: "natural", value: "waterfall" },
  ],
  searchPhrases: [
    "cascada {place}",
    "salto de agua {place}",
    "ruta cascada {place}",
    "waterfall near {place}",
  ],
  extractFields: ["season", "hike length/difficulty", "parking", "access notes"],
};
