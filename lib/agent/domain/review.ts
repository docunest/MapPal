// What the agent sends back per place (design doc: Review + the Sample A/B
// fields). Always AI output: the UI labels it so.
import { z } from "zod";

const evidence = z.object({
  kind: z.enum(["osm", "google", "web", "photo", "wikipedia", "reviews", "other"]),
  url: z.string().max(500).optional(),
  note: z.string().max(300),
});

/**
 * Things that make a place harder for this family than it looks on the map
 * (owner 2026-11-21: "a restaurant in a supermarket… in an old town with banned
 * car traffic, places that don't allow dogs"). Fixed codes so the app can show
 * and filter them; "other" + note for the rest.
 */
export const COMPLICATIONS = {
  inside_shop_or_mall: "inside a supermarket, mall or station — harder to reach",
  car_free_zone: "old town / pedestrian zone, cars banned or restricted",
  no_camper_parking: "nowhere nearby a camper van can park",
  narrow_or_steep_access: "narrow, steep or rough road for a camper",
  height_or_weight_limit: "height, weight or width limit on the way",
  no_dogs: "dogs not allowed (inside or at all)",
  not_child_friendly: "not suitable for a 6-year-old",
  seasonal: "closed part of the year",
  limited_hours: "open only a few hours or days",
  reservation_needed: "booking needed",
  private_or_members: "private, members only or permission needed",
  fee: "entry fee or paid parking",
  safety: "risky (cliffs, mines, unstable ruins…)",
  other: "something else — say what in the note",
} as const;
export type ComplicationFlag = keyof typeof COMPLICATIONS;

const complication = z.object({
  flag: z.enum(Object.keys(COMPLICATIONS) as [ComplicationFlag, ...ComplicationFlag[]]),
  severity: z.enum(["minor", "major", "blocker"]).default("major"),
  note: z.string().max(200).default(""),
});

export const PRICE_TIERS = ["free", "€", "€€", "€€€", "€€€€"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];
/** Family price → tier (2 adults, teen, 6-year-old): the survey's per-person bands × 4. */
export const tierOf = (eur: number): PriceTier => (eur <= 0 ? "free" : eur < 40 ? "€" : eur < 120 ? "€€" : eur < 240 ? "€€€" : "€€€€");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const reviewSchema = z.object({
  candidate: z.string().regex(/^[a-z]{1,3}\d+$/, "candidate id like c3, b2 or e5 (the id shown in the brief)"),
  verdict: z.enum(["real", "fake", "stale"]),
  confidence: z.number().min(0).max(1),
  relevant: z.boolean().describe("matches what the family wants"),
  keep: z.boolean().describe("show it in the results"),
  // Contract v2 (owner 2026-11-21): judged against the brief's like/dislike hints. Optional so older answers still save.
  score: z.number().min(0).max(100).optional().describe("0 = no-go, 50 = undecided, 100 = a must"),
  summary: z.string().max(400).describe("one or two sentences, own words, no copied review text"),
  // Contract v2: [] when none found; each flag only with evidence (a tag, a page, a photo, a review).
  complications: z.array(complication).max(8).optional(),
  vibe: z.enum(["bar-style", "hipster", "local-family", "fancy", "workers-pub", "touristy", "other"]).optional(),
  vibe_confidence: z.number().min(0).max(1).optional(),
  availability: z
    .object({
      kitchen_hours: z.string().max(200).optional(),
      peak_times: z.string().max(200).optional(),
      risks: z.array(z.object({ flag: z.string().max(60), note: z.string().max(200) })).max(5).optional(),
    })
    .optional(),
  food_tags: z.array(z.string().max(30)).max(15).optional(),
  price_samples: z
    .array(z.object({ item: z.string().max(80), price: z.number().min(0), size: z.string().max(30).optional(), currency: z.string().max(3).default("EUR"), seen: z.string().max(40).optional() }))
    .max(8)
    .optional(),
  access: z.enum(["open", "restricted", "closed", "unknown"]).optional(),
  how_to_get_there: z.string().max(300).optional(),
  parking: z.string().max(200).optional(),
  safety_notes: z.string().max(300).optional(),
  // Contract v3 (owner 2026-11-22, activities): price for the whole family with how sure it is, season,
  // event dates, dogs, why a far one is worth it. Optional so food answers and older answers still save.
  price_family_eur: z.number().min(0).max(100000).optional().describe("whole family (2 adults, teen, 6-year-old), euros"),
  price_tier: z.enum(PRICE_TIERS).optional().describe("family: free · € <40 · €€ 40–120 · €€€ 120–240 · €€€€ 240+"),
  price_confidence: z.enum(["high", "medium", "low"]).optional().describe("high = published price seen; medium = similar prices or a range; low = guess"),
  price_note: z.string().max(200).optional(),
  season_note: z.string().max(200).optional().describe("when it runs: season, days, closures in the window"),
  event_start: isoDate.optional(),
  event_end: isoDate.optional(),
  dogs: z.enum(["yes", "no", "unknown"]).optional(),
  must_do_reason: z.string().max(200).optional().describe("only for places beyond the normal distance"),
  evidence: z.array(evidence).max(8),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

/** Bump when the accepted fields change; every brief states it (layer 2), so an edited output-format text can't drift from what the server accepts. */
export const CONTRACT_VERSION = 3;
export const CONTRACT_LINE = `Server contract v${CONTRACT_VERSION} (generated from the code that checks answers): per place candidate, verdict real|stale|fake, confidence 0–1, relevant, keep, score 0–100 (0 = no-go, 50 = undecided, 100 = a must — judged against layer 6, the like/dislike hints), summary ≤ 400 chars, complications (list, [] when none: {flag, severity minor|major|blocker, note}; flags: ${Object.keys(COMPLICATIONS).join(", ")}), evidence ≤ 8; optional ${Object.keys(reviewSchema.shape)
  .filter((k) => !["candidate", "verdict", "confidence", "relevant", "keep", "score", "summary", "complications", "evidence"].includes(k))
  .join(", ")}. Unknown fields are ignored.`;
export const reviewsSchema = z.array(reviewSchema).min(1).max(20);
