// Brand matching shared by the bottom-up agent and the validator.
import type { BrandTier } from "./types";

/** Lowercase, no accents, punctuation → spaces: "Brico Dépôt" → "brico depot". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const containsWord = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

/**
 * Best brand for a place from its brand/name/operator tags: whole-word match,
 * longest brand wins ("Carrefour Express" beats "Carrefour", "Continente
 * Bom Dia" beats "Continente").
 */
export function matchBrand(
  fields: Array<string | undefined>,
  tiers: BrandTier[],
): { brand: string; tier: number } | undefined {
  const hay = fields.filter(Boolean).map((f) => normalize(f!));
  let best: { brand: string; tier: number; len: number } | undefined;
  for (const t of tiers) {
    for (const b of t.brands) {
      const n = normalize(b);
      if (!n) continue;
      if (hay.some((h) => containsWord(h, n)) && (!best || n.length > best.len)) best = { brand: b, tier: t.tier, len: n.length };
    }
  }
  return best && { brand: best.brand, tier: best.tier };
}

/** Brand tiers for a country: country list + "*" list, merged (country first). */
export function brandsFor(brands: Record<string, BrandTier[]>, country?: string): BrandTier[] {
  return [...(country ? brands[country.toUpperCase()] ?? [] : []), ...(brands["*"] ?? [])];
}
