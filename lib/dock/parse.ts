// Pure parsing for links shared to the car dock — no network here, so it is
// testable against captured real links. Static lookup only: coordinates and
// names come straight out of the URL, never from a guess.
import { isValidLatLng, type LatLng } from "../geo";

export interface ParsedLink {
  /** Exact spot of the place, if the URL carries it. */
  point?: LatLng;
  /** Place name from the URL ("Camping Playa Joyel"), if any. */
  title?: string;
  /** Text to geocode when there is no point (a "q=" search, an address). */
  query?: string;
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

function pt(lat: string | number | undefined, lng: string | number | undefined): LatLng | undefined {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== undefined && lng !== undefined && isValidLatLng(a, b) && !(a === 0 && b === 0)
    ? { lat: a, lng: b }
    : undefined;
}

/** "41.38, 2.17" / "41.38,2.17" → a point; anything else → undefined. */
export function coordsFromText(text: string | null | undefined): LatLng | undefined {
  const m = text?.trim().match(new RegExp(`^(?:loc:)?\\s*${NUM}\\s*,\\s*${NUM}\\s*$`));
  return m ? pt(m[1], m[2]) : undefined;
}

function clean(text: string | null | undefined): string | undefined {
  const t = text?.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : undefined;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

/**
 * The first URL in shared text, plus the text around it as a title hint.
 * The Google Maps share sheet sends "Camping Playa Joyel\nhttps://maps.app.goo.gl/…";
 * Waze sends "Use Waze to drive to X: https://waze.com/ul?…".
 */
export function splitSharedText(text: string): { url?: string; hint?: string } {
  const m = text.match(/\b(?:https?:\/\/|geo:)[^\s<>"']+/i);
  if (!m) return { hint: clean(text) };
  const url = m[0].replace(/[),.;!?]+$/, "");
  const rest = text
    .replace(m[0], " ")
    .replace(/^\s*Use Waze to drive to\s*/i, "")
    .split(/\n/)
    .map((l) => l.trim().replace(/[:\-–]+$/, "").trim())
    .filter(Boolean);
  return { url, hint: clean(rest[0]) };
}

export function isShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "maps.app.goo.gl" ||
      (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")) ||
      u.hostname === "g.co" ||
      u.hostname === "share.google"
    );
  } catch {
    return false;
  }
}

/** Google sends EU visitors via consent.google.com?continue=<real url>. */
export function unwrapConsent(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.startsWith("consent.")) return u.searchParams.get("continue") ?? url;
  } catch {
    // not a URL — leave it
  }
  return url;
}

function parseGeoUri(url: string): ParsedLink {
  // geo:41.38,2.17?q=41.38,2.17(Label)  or  geo:0,0?q=Some+Address
  const body = url.slice(4);
  const [path, qs = ""] = body.split("?");
  const q = new URLSearchParams(qs).get("q") ?? undefined;
  const label = q?.match(/\(([^)]+)\)\s*$/)?.[1];
  const qPoint = coordsFromText(q?.replace(/\(.*\)\s*$/, ""));
  const point = qPoint ?? coordsFromText(path.split(";")[0]);
  return {
    point,
    title: clean(label),
    query: !point && q ? clean(q) : undefined,
  };
}

function parseGoogle(u: URL): ParsedLink {
  const href = decode(u.href);
  const out: ParsedLink = {};

  // /maps/place/Camping+Playa+Joyel/@43.48,-3.52,17z/data=...!3d43.4867!4d-3.5161
  const place = u.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  if (place) {
    const name = clean(decode(place));
    const asPoint = coordsFromText(name);
    if (asPoint) out.point = asPoint;
    else out.title = name;
  }

  // !3d<lat>!4d<lng> is the place itself; @lat,lng is only the map view.
  const pins = [...href.matchAll(new RegExp(`!3d${NUM}!4d${NUM}`, "g"))];
  const lastPin = pins.at(-1);
  if (!out.point && lastPin) out.point = pt(lastPin[1], lastPin[2]);

  // Directions: /maps/dir/Origin/Destination/ or ?api=1&destination=
  const dir = u.pathname.match(/\/maps\/dir\/(.+)/)?.[1];
  const destParam = u.searchParams.get("destination") ?? u.searchParams.get("daddr");
  if (destParam) {
    const p = coordsFromText(destParam);
    if (p) out.point ??= p;
    else out.query ??= clean(destParam);
  } else if (dir) {
    const stops = dir.split("/").filter((s) => s && !s.startsWith("@") && !s.startsWith("data="));
    const dest = stops.at(-1);
    if (dest) {
      const p = coordsFromText(decode(dest));
      if (p) out.point ??= p;
      else out.title ??= clean(decode(dest));
    }
  }

  // ?q=lat,lng  ?q=Name, Town  ?query=  ?ll=  ?center=
  for (const key of ["q", "query", "ll", "sll", "center"]) {
    const v = u.searchParams.get(key);
    if (!v) continue;
    const p = coordsFromText(v);
    if (p) out.point ??= p;
    else if (key === "q" || key === "query") out.query ??= clean(v);
  }

  // /maps/search/Name/@... or /maps/search/41.38,+2.17
  const search = u.pathname.match(/\/maps\/search\/([^/]+)/)?.[1];
  if (search) {
    const p = coordsFromText(decode(search));
    if (p) out.point ??= p;
    else out.query ??= clean(decode(search));
  }

  // Last resort: the map view centre. Only trusted when the link names a
  // place (then Google centres on it) — a bare view isn't a destination.
  if (!out.point && place) {
    const at = u.pathname.match(new RegExp(`@${NUM},${NUM}`));
    if (at) out.point = pt(at[1], at[2]);
  }

  if (!out.title && out.query && !out.point) out.title = out.query.split(",")[0];
  if (!out.query && !out.point && out.title) out.query = out.title;
  return out;
}

function parseWaze(u: URL): ParsedLink {
  // waze.com/ul?ll=41.38,2.17&navigate=yes   waze.com/ul?q=Address
  // waze.com/live-map/directions?to=ll.41.38%2C2.17&to_name=...
  const ll = u.searchParams.get("ll");
  const to = u.searchParams.get("to")?.replace(/^ll\./, "");
  const point = coordsFromText(ll) ?? coordsFromText(to);
  const q = u.searchParams.get("q");
  const name = u.searchParams.get("to_name") ?? u.searchParams.get("name");
  return {
    point,
    title: clean(name) ?? (q && !coordsFromText(q) ? clean(q) : undefined),
    query: !point ? clean(q ?? name ?? undefined) : undefined,
  };
}

function parseApple(u: URL): ParsedLink {
  // maps.apple.com/?ll=..&q=Name  ?daddr=..  ?coordinate=..&name=..  /place?address=..
  const point =
    coordsFromText(u.searchParams.get("coordinate")) ??
    coordsFromText(u.searchParams.get("ll")) ??
    coordsFromText(u.searchParams.get("daddr")) ??
    coordsFromText(u.searchParams.get("sll"));
  const name = u.searchParams.get("name") ?? u.searchParams.get("q");
  const addr = u.searchParams.get("address") ?? u.searchParams.get("daddr");
  const title = name && !coordsFromText(name) ? clean(name) : undefined;
  return {
    point,
    title: title ?? (addr && !coordsFromText(addr) ? clean(addr.split(",")[0]) : undefined),
    query: !point ? clean(name ?? addr ?? undefined) : undefined,
  };
}

/** Everything a single (already expanded) map link says about its destination. */
export function parseMapUrl(raw: string): ParsedLink {
  const url = unwrapConsent(raw.trim());
  if (/^geo:/i.test(url)) return parseGeoUri(url);
  const asPoint = coordsFromText(url);
  if (asPoint) return { point: asPoint };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return {};
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host.includes("waze.com")) return parseWaze(u);
  if (host === "maps.apple.com" || host === "maps.apple") return parseApple(u);
  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === "maps.google.com" || host.startsWith("maps.google.")) {
    return parseGoogle(u);
  }
  // OSM: openstreetmap.org/#map=17/41.38/2.17  or ?mlat=&mlon=
  if (host.endsWith("openstreetmap.org")) {
    const m = u.hash.match(new RegExp(`map=\\d+/${NUM}/${NUM}`));
    const point = pt(u.searchParams.get("mlat") ?? undefined, u.searchParams.get("mlon") ?? undefined) ?? (m ? pt(m[1], m[2]) : undefined);
    return { point };
  }
  // Any other link: coordinates in common query params, if present.
  const point =
    pt(u.searchParams.get("lat") ?? undefined, u.searchParams.get("lng") ?? u.searchParams.get("lon") ?? undefined) ??
    coordsFromText(u.searchParams.get("ll"));
  return { point };
}

/**
 * Coordinates/name from a fetched map page, for links whose URL has none
 * (e.g. ?q=Name&ftid=…, ?cid=…). Only reads patterns Google/Apple put there
 * for the place itself: the place pin (!3d!4d), the preview image centre,
 * and og:/canonical URLs that parse like any other link.
 */
export function pageHints(html: string): ParsedLink {
  const out: ParsedLink = {};
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)="${prop}"[^>]+content="([^"]*)"`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name|itemprop)="${prop}"`, "i"))?.[1];
  const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/\\u0026/g, "&").replace(/\\u003d/g, "=");

  for (const candidate of [meta("og:url"), html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1]]) {
    if (!candidate) continue;
    const p = parseMapUrl(unescape(candidate));
    out.point ??= p.point;
    out.title ??= p.title;
  }
  const pin = unescape(html).match(new RegExp(`!3d${NUM}!4d${NUM}`));
  if (pin) out.point ??= pt(pin[1], pin[2]);
  const center = unescape(meta("og:image") ?? "").match(new RegExp(`center=${NUM}(?:%2C|,)${NUM}`));
  if (center) out.point ??= pt(center[1], center[2]);

  const ogTitle = meta("og:title");
  if (ogTitle && !/^google maps$/i.test(ogTitle.trim())) out.title ??= clean(unescape(ogTitle).split(" · ")[0]);
  return out;
}
