// The compact text the agent reads per place (design doc Phase 0 step 3:
// cheap facts first). Every line says where it came from; nothing here is AI.
import type { Candidate } from "./types";

export interface GoogleFacts {
  id: string;
  mapsUri?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  openNow?: boolean;
  hours?: string[];
  summary?: string;
  flags: string[];
  reviews: Array<{ rating?: number; when?: string; text: string }>;
}

export interface PhotoInfo {
  source: "google" | "commons" | "website";
  credit?: string;
  page?: string; // where the photo lives (Commons page / website), stored; Google photos aren't
  url?: string; // the image file (Commons thumbnail / website image) — never a Google URL
  width?: number;
  height?: number;
}

export interface Enrichment {
  google?: GoogleFacts;
  wiki?: { lang: string; title: string; url: string; lead: string };
  photo?: PhotoInfo;
  notes: string[];
}

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

const SHOW_TAGS = [
  "opening_hours", "cuisine", "outdoor_seating", "website", "contact:website", "contact:facebook", "contact:instagram", "phone",
  "description", "access", "fee", "operator", "wikipedia", "wikidata", "ele", "length", "depth", "start_date", "historic:civilization",
  "ruins", "tunnel", "surface", "smoking", "diet:vegetarian", "kids_area", "check_date",
  // what can make it a complication:
  "dog", "level", "maxheight", "maxweight", "motor_vehicle", "reservation", "seasonal",
];

/** Complications the map itself hints at (the agent confirms or drops them). Pure. */
export function osmComplications(t: Record<string, string>): string[] {
  const out: string[] = [];
  if (/^(no|outside)$/.test(t.dog ?? "")) out.push(`no_dogs (dog=${t.dog})`);
  if (t.level && t.level !== "0") out.push(`inside_shop_or_mall? (level=${t.level} — on a floor of a building)`);
  if (/^(no|private|destination)$/.test(t.motor_vehicle ?? "")) out.push(`car_free_zone? (motor_vehicle=${t.motor_vehicle})`);
  if (t.maxheight || t.maxweight) out.push(`height_or_weight_limit (${[t.maxheight && `maxheight=${t.maxheight}`, t.maxweight && `maxweight=${t.maxweight}`].filter(Boolean).join(", ")})`);
  if (/^(required|only|members_only)$/.test(t.reservation ?? "")) out.push(`reservation_needed (reservation=${t.reservation})`);
  if (t.seasonal && t.seasonal !== "no") out.push(`seasonal (seasonal=${t.seasonal})`);
  if (/^(private|no|customers|permit)$/.test(t.access ?? "")) out.push(`private_or_members (access=${t.access})`);
  if (t.fee === "yes") out.push("fee (fee=yes)");
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** photoLinks: a manual run pastes text only, so the photo goes in as its link instead of an attached image. */
export function digestText(c: Candidate, e: Enrichment, opts: { photoLinks?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`### ${c.id} · ${c.name} — ${c.kind} · ${c.near} · OSM ${c.osmRef} · ${c.lat.toFixed(5)},${c.lng.toFixed(5)}`);
  const tags = SHOW_TAGS.filter((k) => c.tags[k]).map((k) => `${k}=${clip(c.tags[k], 90)}`);
  if (tags.length) lines.push(`OSM: ${tags.join("; ")}`);
  const flags = osmComplications(c.tags);
  if (flags.length) lines.push(`Map hints for complications: ${flags.join("; ")}`);
  if (c.parking) {
    const p = c.parking;
    const extra = ["fee", "maxheight", "surface", "access", "capacity"].filter((k) => p.tags[k]).map((k) => `${k}=${p.tags[k]}`);
    lines.push(`Parking (OSM ${p.osmRef}): ${p.name ?? "unnamed"} ${p.distanceM} m away${extra.length ? ` (${extra.join(", ")})` : ""}`);
  } else if ((c.family ?? c.category) === "exploration") lines.push("Parking: none mapped within 3 km");
  const g = e.google;
  if (g) {
    const bits = [
      g.rating !== undefined ? `${g.rating}★ (${g.ratingCount ?? 0})` : "no rating",
      g.priceLevel ? PRICE[g.priceLevel] ?? g.priceLevel : undefined,
      g.businessStatus && g.businessStatus !== "OPERATIONAL" ? `status ${g.businessStatus}` : undefined,
      g.openNow === undefined ? undefined : g.openNow ? "open now" : "closed now",
      ...g.flags,
    ].filter(Boolean);
    lines.push(`Google: ${bits.join(" · ")}`);
    if (g.hours?.length) lines.push(`Google hours: ${g.hours.map((h) => h.replace(/\s+/g, " ")).join(" | ")}`);
    if (g.summary) lines.push(`Google summary: ${clip(g.summary, 200)}`);
    for (const r of g.reviews.slice(0, 3)) lines.push(`Review${r.rating ? ` ${r.rating}★` : ""}${r.when ? ` (${r.when})` : ""}: "${clip(r.text.replace(/\s+/g, " "), 260)}"`);
  }
  if (e.wiki) lines.push(`Wikipedia (${e.wiki.lang}) ${e.wiki.title}: ${clip(e.wiki.lead.replace(/\s+/g, " "), 700)}`);
  if (e.photo) lines.push(opts.photoLinks && e.photo.url ? `Photo: ${e.photo.url} (${e.photo.source}${e.photo.credit ? ` · ${e.photo.credit}` : ""})` : `Photo below: ${e.photo.source}${e.photo.credit ? ` · ${e.photo.credit}` : ""}`);
  else lines.push("Photo: none found");
  for (const n of e.notes) lines.push(`Note: ${n}`);
  return lines.join("\n");
}
