// The run's OpenStreetMap reads (free). Overpass mirrors are flaky, so each
// query walks the mirror list with a generous budget; the dry run reports a
// failed category instead of pretending it is empty.
import { overpassQuery } from "@/lib/overpass";
import type { LatLng } from "@/lib/geo";
import { cafesQuery, exploreQuery, zoneQuery, type Circle } from "../domain/queries";
import { toThings } from "../domain/osm";
import type { OsmThing } from "../domain/types";

// Budgets fit the MCP route's 120 s: zone then cafes (≤ 45 s each) while exploration runs alongside (≤ 105 s).
const opts = { timeoutMs: 30000, attemptsPerEndpoint: 2, totalBudgetMs: 45000 };

export const zoneThings = async (p: LatLng): Promise<OsmThing[]> => toThings(await overpassQuery(zoneQuery(p), opts));
export const cafeThings = async (circles: Circle[]): Promise<OsmThing[]> => toThings(await overpassQuery(cafesQuery(circles), opts));
export const exploreThings = async (c: Circle): Promise<OsmThing[]> => toThings(await overpassQuery(exploreQuery(c), { timeoutMs: 65000, attemptsPerEndpoint: 2, totalBudgetMs: 105000 }));
