// OpenStreetMap's Nominatim geocoder (free; policy: identify yourself,
// ≤1 request/second, no autocomplete-per-keystroke). Used for place search
// in route planning, and as the country lookup when Overpass is down.
import { MAPPAL_USER_AGENT } from "./overpass";
import type { LatLng } from "./geo";

const BASE = "https://nominatim.openstreetmap.org";

async function nominatimGet<T>(path: string, params: Record<string, string>, cacheSeconds?: number): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries({ format: "jsonv2", ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "User-Agent": MAPPAL_USER_AGENT, "Accept-Language": params["accept-language"] ?? "en" },
    signal: AbortSignal.timeout(8000),
    ...(cacheSeconds ? { cache: "force-cache" as const, next: { revalidate: cacheSeconds } } : {}),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as T;
}

/** ISO 3166-1 alpha-2 country code for a point, e.g. "CZ". */
export async function reverseCountry({ lat, lng }: LatLng): Promise<string | undefined> {
  // Rounded to ~10 km so nearby lookups share one cache entry.
  const data = await nominatimGet<{ address?: { country_code?: string } }>(
    "/reverse",
    { lat: lat.toFixed(1), lon: lng.toFixed(1), zoom: "3", addressdetails: "1" },
    60 * 60 * 24 * 30,
  );
  return data.address?.country_code?.toUpperCase();
}

export interface GeocodeHit {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

export async function geocode(query: string, near?: LatLng, lang = "en"): Promise<GeocodeHit[]> {
  const params: Record<string, string> = { q: query, limit: "6", "accept-language": lang };
  if (near) {
    // Prefer (don't restrict to) results around where the user is looking.
    params.viewbox = `${near.lng - 3},${near.lat + 2},${near.lng + 3},${near.lat - 2}`;
  }
  const rows = await nominatimGet<Array<{ name?: string; display_name: string; lat: string; lon: string }>>(
    "/search",
    params,
    60 * 60 * 24,
  );
  return rows.map((r) => ({
    name: r.name || r.display_name.split(",")[0],
    detail: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}
