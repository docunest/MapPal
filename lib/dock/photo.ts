// One photo per car place, so it's recognised at a glance (head unit slide
// menu + list, phone tab). Wikipedia/Wikimedia first — free and fine to
// keep — but only an article that *is* this place: within 400 m and sharing
// a distinctive word with its name (a café next to a church must not get the
// church). Otherwise Google's first photo of the place, if Google is on.
// The devices cache the picture 30 days; MapPal stores nothing.
import { MAPPAL_USER_AGENT } from "../overpass";
import { googlePlacePhoto } from "../sources/google";
import type { SourceContext } from "../sources/types";
import { wikipediaNearby, type WikiGeoPage } from "../wikimedia";

export interface CarPhoto {
  bytes: ArrayBuffer;
  contentType: string;
  source: "wikipedia" | "google";
  credit: string;
}

/** Words that say what kind of place it is, not which one. */
const GENERIC = new Set(
  (
    "de del della di da do das dos la las le les los el lo o os a as al au en y i e et the of and " +
    "playa praia platja hondartza cala praias playas beach " +
    "cafe cafeteria bar restaurante restaurant restaurace taberna tasca pasteleria pastelaria panaderia padaria " +
    "camping parque park parking aparcamiento estacionamento area mirador miradouro viewpoint " +
    "calle carrer rua avenida avinguda plaza placa praca largo paseo passeig " +
    "mercado mercat market iglesia igreja esglesia ermita capilla capela castillo castelo castell " +
    "museo museu museum puente ponte pont puerto porto port faro farol lighthouse santa santo sao san sant"
  ).split(/\s+/),
);

export function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
}

/** The nearest article with a picture that is this place, or undefined. */
export function wikiMatch(title: string, pages: WikiGeoPage[], maxMeters = 400): WikiGeoPage | undefined {
  const mine = new Set(words(title));
  if (mine.size === 0) return undefined;
  return pages
    .filter((p) => p.thumbnail && p.distance <= maxMeters && words(p.title).some((w) => mine.has(w)))
    .sort((a, b) => a.distance - b.distance)[0];
}

/** Local languages first (Iberia), then English. */
const LANGS = ["es", "pt", "ca", "gl", "eu", "en"];

async function wikiPhoto(title: string, lat: number, lng: number): Promise<CarPhoto | null> {
  const found = await Promise.all(LANGS.map((l) => wikipediaNearby(l, { lat, lng }, 500, 20).catch(() => [] as WikiGeoPage[])));
  const page = wikiMatch(title, found.flat());
  if (!page?.thumbnail) return null;
  const res = await fetch(page.thumbnail, { headers: { "User-Agent": MAPPAL_USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
    source: "wikipedia",
    credit: `Wikipedia (${page.lang}) · ${page.title}`,
  };
}

export async function carPhoto(
  place: { title: string; lat: number; lng: number },
  ctx: SourceContext,
  googleOn: boolean,
): Promise<CarPhoto | null> {
  const wiki = await wikiPhoto(place.title, place.lat, place.lng).catch(() => null);
  if (wiki) return wiki;
  if (!googleOn) return null;
  const g = await googlePlacePhoto({ name: place.title, lat: place.lat, lng: place.lng }, ctx).catch(() => null);
  return g ? { ...g, source: "google" } : null;
}
