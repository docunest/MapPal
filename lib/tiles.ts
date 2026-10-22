import * as h3 from "h3-js";
import { booleanIntersects } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";

export interface TileSeed {
  h3Index: string;
  centerLat: number;
  centerLng: number;
  boundary: Feature<Polygon>;
}

// H3 resolution -> approx hex edge length, picked so the region plan's
// "20-30km tiles" target lands around res 6-7. Callers can override.
const DEFAULT_RESOLUTION = 7; // ~5.16 km edge (~ smaller tiles for provinces)

/**
 * Generate H3 hex tiles covering a GeoJSON polygon/multipolygon boundary,
 * keeping only cells whose hex actually intersects the drawn shape (not just
 * its bounding box), so an odd-shaped region doesn't balloon into a rectangle
 * of tiles.
 */
export function tilesForBoundary(
  boundary: Polygon | MultiPolygon,
  resolution: number = DEFAULT_RESOLUTION,
): TileSeed[] {
  const polygons: number[][][] =
    boundary.type === "Polygon" ? [boundary.coordinates[0]] : boundary.coordinates.map((p) => p[0]);

  const cellSet = new Set<string>();
  for (const ring of polygons) {
    // h3-js expects [lat, lng] pairs.
    const latLngRing = ring.map(([lng, lat]) => [lat, lng]);
    const cells = h3.polygonToCells(latLngRing, resolution, false);
    for (const c of cells) cellSet.add(c);
  }

  const boundaryFeature: Feature<Polygon | MultiPolygon> = {
    type: "Feature",
    properties: {},
    geometry: boundary,
  };

  const tiles: TileSeed[] = [];
  for (const h3Index of cellSet) {
    const [lat, lng] = h3.cellToLatLng(h3Index);
    const hexBoundary = h3.cellToBoundary(h3Index, true); // [lng, lat] pairs, GeoJSON order
    const hexPolygon: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[...hexBoundary, hexBoundary[0]]],
      },
    };

    if (!booleanIntersects(hexPolygon, boundaryFeature)) continue;

    tiles.push({ h3Index, centerLat: lat, centerLng: lng, boundary: hexPolygon });
  }

  return tiles;
}

export function bboxOfHex(h3Index: string): [number, number, number, number] {
  const boundary = h3.cellToBoundary(h3Index, true) as [number, number][];
  const lngs = boundary.map((p) => p[0]);
  const lats = boundary.map((p) => p[1]);
  return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)]; // south, west, north, east
}
