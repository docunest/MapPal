// Shared Overpass (OpenStreetMap query API) client, used by both the batch
// region collector and the live around-me features.
//
// The free public Overpass instances return 429/503 under load, so every
// request walks a list of full-planet mirrors.
//
// NOT overpass.osm.ch despite the name — confirmed by testing (2026-10-24)
// to be a Switzerland-only regional mirror (hundreds of results for a
// Zurich bbox, zero for anywhere in Spain). It responds successfully, so a
// bare "did the request succeed" check won't catch this — it just silently
// has no data for most of the world. Do not add it back without verifying
// coverage for your actual region first.
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Mirrors like overpass.kumi.systems rate-limit requests with no
// identifying User-Agent.
export const MAPPAL_USER_AGENT = "MapPal/0.2 (family travel + POI app; contact: 1lukas1@gmail.com)";

export interface OverpassElement {
  type: "node" | "way" | "relation" | "area";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

export interface OverpassOptions {
  /** Per-attempt timeout. Live UI queries want this short; batch scans can wait. */
  timeoutMs?: number;
  /** Attempts per mirror before moving on (with exponential backoff between). */
  attemptsPerEndpoint?: number;
  /**
   * Give up on further mirrors once this much time has passed overall — a
   * live screen would rather show partial (e.g. Wikipedia-only) results now
   * than OSM results in a minute.
   */
  totalBudgetMs?: number;
}

class OverpassHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function postOnce(endpoint: string, query: string, timeoutMs: number): Promise<OverpassElement[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": MAPPAL_USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // 429/503/504 are the overload signals Overpass sends; worth trying again
    // or moving to another mirror. A 400 is our own bad query — fail fast.
    throw new OverpassHttpError(
      `Overpass ${res.status} from ${new URL(endpoint).host}: ${body}`,
      res.status === 429 || res.status >= 500,
    );
  }

  const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
  // Overpass reports server-side timeouts/out-of-memory as HTTP 200 with a
  // "remark" and a truncated element list. Treat that as a failure rather
  // than silently returning partial data.
  if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
    throw new OverpassHttpError(`Overpass ${new URL(endpoint).host}: ${json.remark}`, true);
  }
  return json.elements ?? [];
}

export async function overpassQuery(query: string, options: OverpassOptions = {}): Promise<OverpassElement[]> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const attempts = options.attemptsPerEndpoint ?? 1;
  const deadline = options.totalBudgetMs ? Date.now() + options.totalBudgetMs : Infinity;
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) {
        throw lastError ?? new Error("Overpass: out of time budget");
      }
      try {
        return await postOnce(endpoint, query, Math.min(timeoutMs, remaining));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof OverpassHttpError && !err.retryable) throw err;
      }
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }

  throw lastError ?? new Error("Overpass request failed: no endpoints configured");
}

/** Point coordinates for any element returned with `out center` / `out geom`. */
export function elementLatLng(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  if (el.geometry?.length) {
    const mid = el.geometry[Math.floor(el.geometry.length / 2)];
    return { lat: mid.lat, lng: mid.lon };
  }
  return null;
}

/** Escape a value for use inside an Overpass QL double-quoted string. */
export function qlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
