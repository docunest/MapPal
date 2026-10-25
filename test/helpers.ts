import { readFileSync } from "node:fs";
import path from "node:path";
import { distanceMeters, type LatLng } from "../lib/geo";
import type { OverpassElement } from "../lib/overpass";

export interface OsmFixture {
  center: LatLng;
  elements: OverpassElement[];
}

const root = path.join(__dirname, "fixtures");

export function osmFixture(name: string): OsmFixture {
  return JSON.parse(readFileSync(path.join(root, "osm", `${name}.json`), "utf8")) as OsmFixture;
}

export function jsonFixture<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;
}

/** Same filter Overpass `around:` applies, on a captured extract. */
export function within(elements: OverpassElement[], center: LatLng, radius: number): OverpassElement[] {
  return elements.filter((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    return lat !== undefined && lng !== undefined && distanceMeters(center, { lat, lng }) <= radius;
  });
}

export const IBERIAN_FIXTURES = [
  "arenas-de-cabrales",
  "mertola",
  "matosinhos",
  "puerto-sagunto",
  "lisbon-baixa",
  "madrid-lavapies",
] as const;
