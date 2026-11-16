// Offline places (owner-approved 2026-11-16: "same as the car" in the web app). The car dock's
// monthly OSM packs (docunest/ANDROID-APPS .github/workflows/dock-poi.yml, release "dock-poi")
// also carry the places as small JSON chunks ("web" in poi-manifest.json); the phone downloads
// them through /api/offline/<file> (GitHub sends no CORS headers) into IndexedDB.
// Lookup data from OpenStreetMap (ODbL) — nothing AI.
import { ROAD_LAYERS, type RoadLayer } from "@/lib/dock/road";

export const PACK_RELEASE = "https://github.com/docunest/ANDROID-APPS/releases/download/dock-poi/";

export const COUNTRIES = [
  { cc: "es", name: "Spain", flag: "🇪🇸" },
  { cc: "pt", name: "Portugal", flag: "🇵🇹" },
  { cc: "fr", name: "France", flag: "🇫🇷" },
  { cc: "it", name: "Italy", flag: "🇮🇹" },
  { cc: "de", name: "Germany", flag: "🇩🇪" },
] as const;
export type CountryCode = (typeof COUNTRIES)[number]["cc"];

/** Files the proxy may pass on: the manifest and the web chunks, nothing else from the release. */
export const PACK_FILE = /^(poi-manifest\.json|poi-(es|pt|fr|it|de)-w\d{1,3}\.json\.gz)$/;

export type WebChunk = { file: string; bytes: number; sha256: string; cells: number; count: number };
export type PackEntry = {
  file: string;
  bytes: number;
  sha256: string;
  count: number;
  sourceDate: string;
  built: string;
  web?: { layers: RoadLayer[]; cell: number; chunks: WebChunk[] };
};
export type PackManifest = { version: number; updated: string; packs: Partial<Record<CountryCode, PackEntry>> };

/** One stored place: [layer index, lat×1e5, lng×1e5, name, brand, info, osm id]. */
export type PackRow = [number, number, number, string | null, string | null, string | null, string];

export type OfflinePoi = {
  osm: string;
  layer: RoadLayer;
  lat: number;
  lng: number;
  name: string | null;
  brand: string | null;
  info: string | null;
  distM: number;
};

export const LAYER_GROUPS: Array<{ id: string; label: string; layers: RoadLayer[] }> = [
  { id: "essentials", label: "Road essentials", layers: ["fuel", "rest", "grocery", "toilets", "water"] },
  { id: "camper", label: "Camper", layers: ["aire", "dump", "limit"] },
  { id: "kids", label: "Kids & breaks", layers: ["playground", "picnic", "beach"] },
  { id: "cool", label: "Cool stuff", layers: ["castle", "viewpoint", "lighthouse", "dam", "bridge", "works", "power", "quarry", "airport"] },
];

export function layerIcon(l: RoadLayer): string {
  return ROAD_LAYERS[l].icon;
}
export function layerLabel(l: RoadLayer): string {
  return l === "fuel" ? "Diesel" : ROAD_LAYERS[l].label;
}

/** The 1/4° cells (or [cell]-th of a degree) a [radiusM] circle touches. */
export function cellsAround(lat: number, lng: number, radiusM: number, cell = 4): string[] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const out: string[] = [];
  for (let a = Math.floor((lat - dLat) * cell); a <= Math.floor((lat + dLat) * cell); a++) {
    for (let b = Math.floor((lng - dLng) * cell); b <= Math.floor((lng + dLng) * cell); b++) out.push(`${a}_${b}`);
  }
  return out;
}

/** Nearest [limit] rows of [layer] within [radiusM], from the rows of the cells around the point. */
export function nearestRows(
  rows: Iterable<PackRow>,
  layers: RoadLayer[],
  layer: RoadLayer,
  lat: number,
  lng: number,
  radiusM: number,
  limit: number,
): OfflinePoi[] {
  const idx = layers.indexOf(layer);
  const seen = new Set<string>();
  const out: OfflinePoi[] = [];
  const c = Math.cos((lat * Math.PI) / 180);
  for (const r of rows) {
    if (r[0] !== idx || seen.has(r[6])) continue;
    const pl = r[1] / 1e5, pg = r[2] / 1e5;
    const d = Math.hypot(((pg - lng) * Math.PI) / 180 * c, ((pl - lat) * Math.PI) / 180) * 6_371_000;
    if (d > radiusM) continue;
    seen.add(r[6]); // border areas: the same object is in two countries' extracts
    out.push({ osm: r[6], layer, lat: pl, lng: pg, name: r[3], brand: r[4], info: r[5], distM: d });
  }
  return out.sort((a, b) => a.distM - b.distM).slice(0, limit);
}

/** "n123" → https://www.openstreetmap.org/node/123 */
export function osmUrl(osm: string): string {
  const type = osm[0] === "n" ? "node" : osm[0] === "w" ? "way" : "relation";
  return `https://www.openstreetmap.org/${type}/${osm.slice(1)}`;
}
