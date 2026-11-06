// Top-down agent: turns the scenario prompt into what to search for in one
// area — the region's relevant brands (tiered) and local-language name
// keywords. Asked once per (scenario version, area) and cached
// (ScenarioPlan), so stops in the same area reuse it.
//
// The AI receives the scenario prompt, the country/region code and the
// local languages — no coordinates, no stop, nothing about the family.
// Without AI (no key, capped, failed) the config's seed brands are used and
// the run says so.
import { z } from "zod";
import type { AiClient } from "../ai/deepseek";
import { brandsFor } from "./brands";
import type { BrandTier, ScenarioConfig, Tag, TopDownPlan } from "./types";

export function seedPlan(config: ScenarioConfig, country?: string, note?: string): TopDownPlan {
  return { brands: brandsFor(config.brands, country), keywords: [], extraTags: [], by: "defaults", note };
}

const AiPlan = z.object({
  brands: z
    .array(z.object({ name: z.string().min(2).max(60), tier: z.number().int().min(1).max(9) }))
    .max(60)
    .default([]),
  keywords: z.array(z.string().min(3).max(40)).max(25).default([]),
  extraTags: z
    .array(z.tuple([z.string(), z.string()]))
    .max(6)
    .default([]),
});

// The AI may suggest extra OSM tags, but only plain shop/amenity/craft
// values — nothing that could turn the query into something else.
const SAFE_TAG = (t: Tag) => ["shop", "amenity", "craft"].includes(t[0]) && /^[a-z_]{2,30}$/.test(t[1]);

export function topDownMessages(prompt: string, config: ScenarioConfig, area: { country?: string; area?: string; langs: string[] }) {
  const seeds = brandsFor(config.brands, area.country);
  const system = `You help a travel app find shops. You know retail chains in Spain and Portugal well.
Answer with JSON only: {"brands":[{"name":string,"tier":number}],"keywords":[string],"extraTags":[[key,value]]}.
- brands: chains present in this area that fit the request, with the tier scheme below. Include the seed brands that really operate here, drop those that don't, add regional chains that are missing. Use the name as written on the shop sign.
- keywords: words that appear in the NAMES of independent shops of this kind, in the local languages (lowercase word stems, no accents needed).
- extraTags: OpenStreetMap shop=... tags (as ["shop","value"]) used for this kind of shop that are missing from the current list; usually none.
Tiers: ${Object.entries(config.tierLabels)
    .map(([t, l]) => `${t} = ${l}`)
    .join(", ")}. Only use tiers that are listed for brands (${seeds.map((s) => s.tier).join(", ") || "1, 2"}).`;
  const user = `Request (from the family):
${prompt}

Kind of place: ${config.categoryLabel}
Country: ${area.country ?? "unknown"}; region (ISO 3166-2): ${area.area ?? "unknown"}; local languages: ${area.langs.join(", ")}
Current OSM tags: ${config.osmTags.map(([k, v]) => `${k}=${v}`).join(", ")}
Current name keywords: ${config.nameKeywords.join(", ")}
Seed brands: ${JSON.stringify(seeds)}`;
  return { system, user };
}

/** Merge the AI's answer with the seeds: seeds stay unless the AI gives the same brand another tier. */
export function mergePlan(seeds: BrandTier[], ai: z.infer<typeof AiPlan>): { brands: BrandTier[]; keywords: string[]; extraTags: Tag[] } {
  const tierOf = new Map<string, { name: string; tier: number }>();
  for (const t of seeds) for (const b of t.brands) tierOf.set(b.toLowerCase(), { name: b, tier: t.tier });
  for (const b of ai.brands) tierOf.set(b.name.toLowerCase(), { name: b.name, tier: b.tier });
  const byTier = new Map<number, string[]>();
  for (const { name, tier } of tierOf.values()) byTier.set(tier, [...(byTier.get(tier) ?? []), name]);
  return {
    brands: [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([tier, brands]) => ({ tier, brands })),
    keywords: [...new Set(ai.keywords.map((k) => k.toLowerCase().trim()))],
    extraTags: ai.extraTags.filter(SAFE_TAG),
  };
}

export async function topDownPlan(
  prompt: string,
  config: ScenarioConfig,
  area: { country?: string; area?: string; langs: string[] },
  ai: AiClient | null,
): Promise<{ plan: TopDownPlan; tokensIn: number; tokensOut: number; error?: string }> {
  if (!ai) return { plan: seedPlan(config, area.country, "AI off — seed brands only"), tokensIn: 0, tokensOut: 0 };
  try {
    const { system, user } = topDownMessages(prompt, config, area);
    const r = await ai.chatJson(system, user, { maxTokens: 1200 });
    const parsed = AiPlan.parse(r.json);
    const merged = mergePlan(brandsFor(config.brands, area.country), parsed);
    return { plan: { ...merged, by: `ai:${r.model}` }, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { plan: seedPlan(config, area.country, `AI failed (${msg.slice(0, 120)}) — seed brands only`), tokensIn: 0, tokensOut: 0, error: msg };
  }
}
