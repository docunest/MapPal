import type { CategoryDef } from "../categories/types";
import { overpassQuery, qlString } from "../overpass";

export interface OverpassCandidate {
  osmType: string;
  osmId: number;
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

function buildQuery(category: CategoryDef, bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  const clauses: string[] = [];
  for (const type of category.elementTypes) {
    for (const filter of category.overpassFilters) {
      // Category filters are user-editable via /categories, so escape them.
      const tagExpr = filter.value
        ? `["${qlString(filter.key)}"="${qlString(filter.value)}"]`
        : `["${qlString(filter.key)}"]`;
      clauses.push(`  ${type}${tagExpr}(${bboxStr});`);
    }
  }

  return `[out:json][timeout:25];\n(\n${clauses.join("\n")}\n);\nout center tags;`;
}

/**
 * Query Overpass for every tag combination in a category, within a tile's
 * bounding box. This is the zero-cost, zero-API-key collector — the MVP's
 * backbone before web-search/Wikiloc/Instagram collectors get added.
 */
export async function runOverpassCollector(
  category: CategoryDef,
  bbox: [number, number, number, number],
): Promise<OverpassCandidate[]> {
  const query = buildQuery(category, bbox);
  // Batch scans aren't waited on interactively, so be patient: 3 attempts
  // per mirror with backoff, rather than failing a job on one transient blip.
  const elements = await overpassQuery(query, { timeoutMs: 45000, attemptsPerEndpoint: 3 });

  const candidates: OverpassCandidate[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;

    const tags = el.tags ?? {};
    candidates.push({
      osmType: el.type,
      osmId: el.id,
      name: tags.name ?? `Unnamed ${category.label}`,
      lat,
      lng,
      tags,
    });
  }

  return candidates;
}
