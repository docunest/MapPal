// Network side of the car dock: expand short links, place links that carry
// no coordinates, and name a GPS bookmark. Every result says how it was
// located (see DockItem.locatedBy) so the head unit never presents a
// geocoded guess as an exact pin.
import { distanceMeters, type LatLng } from "../geo";
import { searchPlace, reversePlace } from "../nominatim";
import { elementLatLng, overpassQuery } from "../overpass";
import { isShortLink, pageHints, parseMapUrl, splitSharedText, unwrapConsent, coordsFromText, type ParsedLink } from "./parse";

export type LocatedBy = "link" | "search" | "gps" | "none";

export interface ResolvedLink {
  title: string;
  sourceUrl?: string;
  resolvedUrl?: string;
  point?: LatLng;
  locatedBy: LocatedBy;
  address?: string;
}

const BROWSER_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

/**
 * Follows redirects by hand so we see each hop (and can read the real URL
 * behind consent pages). If the last stop is a page rather than a redirect,
 * also reads it for the place's coordinates (see pageHints).
 */
export async function expandUrl(url: string, maxHops = 8): Promise<{ url: string; page?: ParsedLink }> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": BROWSER_UA, "Accept-Language": "es,en;q=0.8" },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      return { url: current };
    }
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      current = unwrapConsent(new URL(next, current).href);
      if (!isShortLink(current) && parseMapUrl(current).point) return { url: current };
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return { url: current };
    const html = (await res.text()).slice(0, 3_000_000);
    // Some short links answer 200 with a JS/meta redirect instead of a 30x.
    const refresh = html.match(/http-equiv="refresh"[^>]+url=([^"'>]+)/i)?.[1] ?? html.match(/location(?:\.href)?\s*=\s*"(https:[^"]+)"/)?.[1];
    if (refresh && isShortLink(current)) {
      current = unwrapConsent(refresh.replace(/&amp;/g, "&"));
      continue;
    }
    return { url: current, page: pageHints(html) };
  }
  return { url: current };
}

/** Turns whatever the phone shared (link, "Name\nlink", "41.4,2.1") into a destination. */
export async function resolveShared(input: { text?: string; url?: string; title?: string }): Promise<ResolvedLink> {
  const raw = [input.url, input.text].filter(Boolean).join("\n");
  const { url, hint } = splitSharedText(raw);
  const plainPoint = !url ? coordsFromText(raw) : undefined;
  if (plainPoint) {
    return { title: input.title ?? hint ?? formatPoint(plainPoint), point: plainPoint, locatedBy: "link" };
  }

  let resolvedUrl = url;
  let page: ParsedLink | undefined;
  if (url && isShortLink(url)) ({ url: resolvedUrl, page } = await expandUrl(url));
  const parsed: ParsedLink = resolvedUrl ? parseMapUrl(resolvedUrl) : {};
  // A full Google link with no coordinates (?q=Name&ftid=…, ?cid=…): its page may have them.
  if (resolvedUrl && !parsed.point && !page && /google\./.test(new URL(resolvedUrl).hostname)) {
    page = (await expandUrl(resolvedUrl, 2)).page;
  }
  if (!parsed.point && page?.point) parsed.point = page.point;
  parsed.title ??= page?.title;
  const title = input.title?.trim() || parsed.title || hint;
  let point = parsed.point;
  let locatedBy: LocatedBy = point ? "link" : "none";
  let address: string | undefined;

  // No coordinates anywhere: search OSM for the name the link (or the share
  // text) gives — "Camping Playa Joyel, Noja" is usually enough.
  const query = parsed.query ?? parsed.title ?? hint;
  if (!point && query) {
    const hit = await searchPlace(query).catch(() => undefined);
    if (hit) {
      point = hit.point;
      address = hit.address;
      locatedBy = "search";
    }
  }
  return {
    title: title || (point ? formatPoint(point) : url ?? "Shared place"),
    sourceUrl: url,
    resolvedUrl: resolvedUrl !== url ? resolvedUrl : undefined,
    point,
    locatedBy,
    address,
  };
}

export function formatPoint({ lat, lng }: LatLng): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Named things worth calling a bookmark by — where a camper actually stops.
const NAMED_NEARBY = [
  `nwr(around:{r},{lat},{lng})["tourism"~"^(camp_site|caravan_site|viewpoint|attraction|picnic_site|alpine_hut|wilderness_hut)$"]["name"];`,
  `nwr(around:{r},{lat},{lng})["amenity"~"^(parking|restaurant|cafe|fuel|place_of_worship)$"]["name"];`,
  `nwr(around:{r},{lat},{lng})["natural"~"^(beach|bay|peak|spring|cave_entrance|cape)$"]["name"];`,
  `nwr(around:{r},{lat},{lng})["leisure"~"^(park|nature_reserve|marina|beach_resort)$"]["name"];`,
  `nwr(around:{r},{lat},{lng})["historic"]["name"];`,
  `nwr(around:{r},{lat},{lng})["waterway"="waterfall"]["name"];`,
];

/** Nearest named campsite/beach/viewpoint/... within `radius` m (OSM). */
export async function nearestNamedPlace(p: LatLng, radius = 250): Promise<string | undefined> {
  const body = NAMED_NEARBY.map((l) =>
    l.replace("{r}", String(radius)).replace("{lat}", p.lat.toFixed(6)).replace("{lng}", p.lng.toFixed(6)),
  ).join("\n");
  const els = await overpassQuery(`[out:json][timeout:15];(\n${body}\n);out center tags 40;`, {
    timeoutMs: 15000,
    totalBudgetMs: 25000,
  });
  // A campsite you're standing in beats a café next door: prefer the area
  // that contains us (distance to its centre is a fair proxy), camp sites first.
  const rank = (t: Record<string, string> | undefined) =>
    t?.tourism === "camp_site" || t?.tourism === "caravan_site" ? 0 : t?.natural === "beach" ? 1 : 2;
  const best = els
    .map((e) => ({ e, at: elementLatLng(e) }))
    .filter((x): x is { e: (typeof els)[number]; at: LatLng } => !!x.at && !!x.e.tags?.name)
    .map((x) => ({ name: x.e.tags!.name, rank: rank(x.e.tags), d: distanceMeters(p, x.at) }))
    .sort((a, b) => a.rank - b.rank || a.d - b.d)[0];
  return best?.name;
}

/** "I like this place": a name for where we are, best source first. */
export async function nameForPoint(p: LatLng): Promise<{ title: string; address?: string }> {
  const [named, rev] = await Promise.all([
    nearestNamedPlace(p).catch(() => undefined),
    reversePlace(p).catch(() => ({}) as { name?: string; address?: string }),
  ]);
  const title = named ?? rev.name ?? rev.address?.split(",").slice(0, 2).join(",") ?? formatPoint(p);
  return { title, address: rev.address };
}
