// What the agent sends back per place (design doc: Review + the Sample A/B
// fields). Always AI output: the UI labels it so.
import { z } from "zod";

const evidence = z.object({
  kind: z.enum(["osm", "google", "web", "photo", "wikipedia", "reviews", "other"]),
  url: z.string().max(500).optional(),
  note: z.string().max(300),
});

export const reviewSchema = z.object({
  candidate: z.string().regex(/^[ce]\d+$/, "candidate id like c3 or e2"),
  verdict: z.enum(["real", "fake", "stale"]),
  confidence: z.number().min(0).max(1),
  relevant: z.boolean().describe("matches what the family wants"),
  keep: z.boolean().describe("show it in the results"),
  summary: z.string().max(400).describe("one or two sentences, own words, no copied review text"),
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
  evidence: z.array(evidence).max(8),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
export const reviewsSchema = z.array(reviewSchema).min(1).max(20);
