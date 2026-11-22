// Discover mode: the agent names the best places itself (from what it knows,
// the web, Google Maps, Instagram); the server cross-checks every name against
// the OpenStreetMap index. Pure: the answer format, name matching, the key of
// a place that isn't on the map.
import { z } from "zod";
import { distanceMeters, type LatLng } from "@/lib/geo";
import { shortHash } from "./hash";
import { reviewSchema } from "./review";
import type { OsmThing } from "./types";

const url = z.string().max(500);

/** One place the agent found: where it is, where it saw it, and the same judgement fields as a brief answer. */
export const discoverySchema = reviewSchema.omit({ candidate: true }).extend({
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(200).optional(),
  google_maps_url: url.optional(),
  instagram_url: url.optional(),
  website: url.optional(),
  osm_ref: z.string().regex(/^(node|way|relation)\/\d+$/).optional(),
  /** Where it's listed: osm, google_maps, instagram, website, tripadvisor, other. */
  listed_on: z.array(z.string().max(30)).max(8).optional(),
  why_top: z.string().max(300).optional(),
});
export type DiscoveryInput = z.infer<typeof discoverySchema>;
export const discoveriesSchema = z.array(discoverySchema).min(1).max(30);

export const DISCOVER_LINE = `Server contract (discover): per place name, lat, lng (from Google Maps or the source, ≥ 4 decimals), at least one of google_maps_url / instagram_url / website, listed_on, why_top, and the judgement fields verdict real|stale|fake, confidence 0–1, relevant, keep, score 0–100, summary ≤ 400 chars, complications ([] when none), evidence (≥ 1 with the url you checked); optional address, osm_ref (node/123 if you know it), ${Object.keys(reviewSchema.shape)
  .filter((k) => !["candidate", "verdict", "confidence", "relevant", "keep", "score", "summary", "complications", "evidence"].includes(k))
  .join(", ")}.`;

/** The no-mistakes rules for finding places (layer 2 of a discover prompt). */
export const DISCOVER_RULES = `You name the places yourself — nobody gave you a list, so the charter's "judge only the listed places" doesn't apply here; everything else in it does. Rules:
- No mistakes. List only places you are sure exist and are open now (not closed for good, not moved). If you can browse, check each one (Google Maps listing, its Instagram, its website, recent reviews) before listing it. Can't verify → leave it out, or give it confidence ≤ 0.5 and say what you couldn't check.
- Every place needs a link you actually checked: google_maps_url, instagram_url or website, and the same link in evidence. Never invent a link, an address or coordinates.
- Coordinates from the Google Maps pin or the source, ≥ 4 decimals. Inside the radius only.
- Places that exist only on Google Maps or only on Instagram are welcome — say so in listed_on (e.g. ["google_maps"], ["instagram"]). The server cross-checks OpenStreetMap; not being there is fine.
- Prefer hidden gems the family would like (layer 6) over the usual top-10 lists, but only real ones.
- Never return a place from layer 5 (already known) or one the family marked "never".
- Fewer good places beat a padded list.`;

const STOP = new Set(["cafe", "caffe", "coffee", "pastelaria", "padaria", "confeitaria", "restaurante", "restaurant", "rest", "bar", "pub", "cervejaria", "taberna", "tasca", "snack", "snackbar", "o", "a", "os", "as", "the", "de", "do", "da", "dos", "das", "e", "el", "la", "los", "las", "y", "and", "&"]);

export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (s: string) => {
  const all = normName(s).split(" ").filter(Boolean);
  const kept = all.filter((t) => !STOP.has(t));
  return new Set(kept.length ? kept : all);
};

/** 0–1: how alike two place names are ("Café Bordalo" ~ "Bordalo Café-Bar"). */
export function nameSimilarity(a: string, b: string): number {
  if (normName(a) === normName(b)) return 1;
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const t of x) if (y.has(t)) common++;
  // Containment counts: "Malaica" vs "Malaica Organic Brewery".
  return Math.max(common / Math.min(x.size, y.size) - (x.size !== y.size ? 0.25 : 0), (2 * common) / (x.size + y.size));
}

export interface IndexMatch {
  osmRef: string;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  similarity: number;
  how: "osm_ref" | "name+place";
}

/**
 * The OpenStreetMap element the agent meant: its osm_ref if that's in the
 * index, else the most alike name nearby (closer allows a looser name; an
 * exact name may be up to 1.5 km off, since agents' pins drift).
 */
export function matchToIndex(d: { name: string; lat: number; lng: number; osm_ref?: string }, index: OsmThing[]): IndexMatch | null {
  if (d.osm_ref) {
    const t = index.find((x) => x.ref === d.osm_ref);
    if (t) return { osmRef: t.ref, name: t.tags.name ?? d.name, lat: t.lat, lng: t.lng, distanceM: Math.round(distanceMeters(d, t)), similarity: 1, how: "osm_ref" };
  }
  let best: IndexMatch | null = null;
  for (const t of index) {
    if (!t.tags.name) continue;
    const dist = distanceMeters(d, t);
    if (dist > 1500) continue;
    const sim = Math.max(nameSimilarity(d.name, t.tags.name), t.tags["name:pt"] ? nameSimilarity(d.name, t.tags["name:pt"]) : 0, t.tags.brand ? nameSimilarity(d.name, t.tags.brand) * 0.9 : 0);
    const need = dist < 150 ? 0.5 : dist < 500 ? 0.8 : 0.95;
    if (sim < need) continue;
    const m: IndexMatch = { osmRef: t.ref, name: t.tags.name, lat: t.lat, lng: t.lng, distanceM: Math.round(dist), similarity: Math.round(sim * 100) / 100, how: "name+place" };
    if (!best || m.similarity > best.similarity || (m.similarity === best.similarity && m.distanceM < best.distanceM)) best = m;
  }
  return best;
}

/** Key of a place that isn't on OpenStreetMap: stable for the same name about the same spot (~100 m). */
export const extRef = (d: { name: string } & LatLng) => `ext/${shortHash(normName(d.name), d.lat.toFixed(3), d.lng.toFixed(3))}`;
export const isPlaceKey = (k: string) => /^(node|way|relation)\/\d+$/.test(k) || /^ext\/[0-9a-f]{12}$/.test(k);
