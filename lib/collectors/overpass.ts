import type { CategoryDef } from "../categories/types";

// The free public Overpass instance is known to return 503 under load.
// Try a couple of mirrors with backoff rather than failing the whole job
// on one transient blip.
//
// NOT overpass.osm.ch despite the name — confirmed by testing (2026-10-24)
// to be a Switzerland-only regional mirror (hundreds of results for a
// Zurich bbox, zero for anywhere in Spain). It responds successfully, so a
// bare "did the request succeed" check won't catch this — it just silently
// has no data for most of the world. Do not add it back without verifying
// coverage for your actual region first.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

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

async function fetchFromOverpass(query: string): Promise<Response> {
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // Mirrors like overpass.kumi.systems rate-limit requests with no
            // identifying User-Agent.
            "User-Agent": "MapPal/0.1 (family POI indexer; contact: 1lukas1@gmail.com)",
          },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (res.ok) return res;
        // 429/503 are the overload signals Overpass sends; worth a retry/backoff.
        if (res.status !== 429 && res.status !== 503) {
          throw new Error(`Overpass request failed: ${res.status} ${await res.text()}`);
        }
        lastError = new Error(`Overpass request failed: ${res.status} ${await res.text()}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }

  throw lastError ?? new Error("Overpass request failed: no endpoints configured");
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
  const res = await fetchFromOverpass(query);

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
