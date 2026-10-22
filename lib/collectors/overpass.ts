import type { CategoryDef } from "../categories/types";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

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
      const tagExpr = filter.value ? `["${filter.key}"="${filter.value}"]` : `["${filter.key}"]`;
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

  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    elements: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const candidates: OverpassCandidate[] = [];
  for (const el of json.elements) {
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
