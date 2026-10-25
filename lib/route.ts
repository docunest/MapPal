// Driving route between two points via OSRM's free public demo server
// (fair use; plenty for a family planning a few drives a day).
import type { LatLng } from "./geo";
import { MAPPAL_USER_AGENT } from "./overpass";

export interface DrivingRoute {
  line: LatLng[];
  km: number;
  minutes: number;
}

export async function drivingRoute(from: LatLng, to: LatLng): Promise<DrivingRoute> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { headers: { "User-Agent": MAPPAL_USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const json = (await res.json()) as {
    code: string;
    message?: string;
    routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
  };
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) throw new Error(json.message ?? `No driving route found (${json.code})`);
  return {
    line: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    km: Math.round(route.distance / 100) / 10,
    minutes: Math.round(route.duration / 60),
  };
}
