// OpenStreetMap's Nominatim geocoder (free; policy: identify yourself,
// ≤1 request/second). Used for "which region are we in" (→ which local
// Wikipedias to read) and for a place's street address.
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

interface ReverseResult {
  display_name?: string;
  address?: Record<string, string>;
}

export interface Region {
  /** ISO 3166-1 alpha-2, e.g. "ES". */
  country?: string;
  /** ISO 3166-2 first-level region, e.g. "ES-CT" (Catalonia). */
  region?: string;
}

/** Country + first-level region for a point (rounded to ~10 km, cached for a month). */
export async function reverseRegion({ lat, lng }: LatLng): Promise<Region> {
  const data = await nominatimGet<ReverseResult>(
    "/reverse",
    { lat: lat.toFixed(1), lon: lng.toFixed(1), zoom: "5", addressdetails: "1" },
    60 * 60 * 24 * 30,
  );
  return {
    country: data.address?.country_code?.toUpperCase(),
    region: data.address?.["ISO3166-2-lvl4"] ?? data.address?.["ISO3166-2-lvl3"],
  };
}

/** Human street address of a place ("Rua Brito Capelo 120, Matosinhos"). */
export async function reverseAddress({ lat, lng }: LatLng, lang = "en"): Promise<string | undefined> {
  const data = await nominatimGet<ReverseResult>(
    "/reverse",
    { lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: "18", addressdetails: "1", "accept-language": lang },
    60 * 60 * 24 * 30,
  );
  const a = data.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.square, a.house_number].filter(Boolean).join(" ");
  const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality;
  const parts = [street, a.suburb && a.suburb !== town ? a.suburb : undefined, town, a.state ?? a.province].filter(Boolean);
  return parts.length ? parts.join(", ") : data.display_name;
}

interface SearchResult {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
}

/**
 * Best match for a place name or address ("Camping Playa Joyel, Noja").
 * Iberia (and neighbours we drive through) first, then anywhere.
 */
export async function searchPlace(query: string): Promise<{ point: LatLng; name?: string; address?: string } | undefined> {
  for (const countrycodes of ["es,pt,fr,ad,gi", undefined]) {
    const params: Record<string, string> = { q: query, limit: "1", "accept-language": "es,pt,en" };
    if (countrycodes) params.countrycodes = countrycodes;
    const [hit] = await nominatimGet<SearchResult[]>("/search", params, 60 * 60 * 24 * 7);
    if (hit) {
      return {
        point: { lat: Number(hit.lat), lng: Number(hit.lon) },
        name: hit.name || undefined,
        address: hit.display_name,
      };
    }
  }
  return undefined;
}

/** What's right here: the named thing (a campsite, a beach) if OSM has one, plus an address. */
export async function reversePlace({ lat, lng }: LatLng): Promise<{ name?: string; address?: string }> {
  const data = await nominatimGet<ReverseResult & { name?: string }>(
    "/reverse",
    { lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: "18", addressdetails: "1", "accept-language": "es,pt,en" },
    60 * 60 * 24 * 30,
  );
  const a = data.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.square ?? a.track, a.house_number].filter(Boolean).join(" ");
  const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality;
  const address = [street, town, a.state ?? a.province].filter(Boolean).join(", ") || data.display_name;
  return { name: data.name || undefined, address };
}
