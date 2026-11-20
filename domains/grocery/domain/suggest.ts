// "You usually buy…": the free, local shortlist from the family's own rhythm.
// For each product: how often it was bought (distinct days), the average gap
// between purchases and the days since the last one. due = daysSince / gap.
// With little history the staples fill in. DeepSeek can refine it on demand
// (domain/ai.ts shortlistWithAi) — this list never needs it.
import type { CatalogItem } from "./text";

export type Purchase = { productId: string; at: Date };

export type ProductStats = { product: CatalogItem; count: number; intervalDays: number | null; daysSince: number | null; due: number };

export type DueSuggestion = { productId: string; name: string; categoryId: string; kind: string; reason: "due" | "often" | "staple"; count: number; intervalDays: number | null; daysSince: number | null; score: number };

const DAY = 86_400_000;

export function productStats(purchases: Purchase[], products: CatalogItem[], now = Date.now()): ProductStats[] {
  const days = new Map<string, Set<number>>();
  for (const p of purchases) {
    const d = Math.floor(p.at.getTime() / DAY);
    if (!days.has(p.productId)) days.set(p.productId, new Set());
    days.get(p.productId)!.add(d);
  }
  const out: ProductStats[] = [];
  for (const product of products) {
    const set = days.get(product.id);
    if (!set?.size) continue;
    const sorted = [...set].sort((a, b) => a - b);
    const count = sorted.length;
    const intervalDays = count >= 2 ? Math.max(1, Math.round((sorted[count - 1] - sorted[0]) / (count - 1))) : null;
    const daysSince = Math.floor(now / DAY) - sorted[count - 1];
    const due = intervalDays ? daysSince / intervalDays : 0;
    out.push({ product, count, intervalDays, daysSince, due });
  }
  return out;
}

export function dueItems(
  purchases: Purchase[],
  products: CatalogItem[],
  onList: Set<string>,
  categories: { id: string; sortOrder: number }[],
  now = Date.now(),
): { stats: ProductStats[]; suggestions: DueSuggestion[] } {
  const stats = productStats(purchases, products, now);
  const order = new Map(categories.map((c) => [c.id, c.sortOrder]));
  const picked: DueSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: DueSuggestion) => {
    if (onList.has(s.productId) || seen.has(s.productId)) return;
    seen.add(s.productId);
    picked.push(s);
  };
  const base = (s: ProductStats) => ({
    productId: s.product.id, name: s.product.name, categoryId: s.product.categoryId, kind: s.product.kind,
    count: s.count, intervalDays: s.intervalDays, daysSince: s.daysSince,
  });
  for (const s of stats) {
    if (s.product.kind === "LONGTERM") continue;
    if (s.intervalDays && s.due >= 0.8) push({ ...base(s), reason: "due", score: Math.min(3, s.due) + s.count / 50 });
    else if (!s.intervalDays && s.count === 1 && (s.daysSince ?? 0) >= 7) push({ ...base(s), reason: "often", score: 0.3 });
  }
  // Little history yet → staples, so planning is one tap from day one.
  const totalDays = new Set(purchases.map((p) => Math.floor(p.at.getTime() / DAY))).size;
  if (totalDays < 4) {
    for (const p of products) {
      if (p.staple && !stats.some((s) => s.product.id === p.id)) {
        push({ productId: p.id, name: p.name, categoryId: p.categoryId, kind: p.kind, reason: "staple", count: 0, intervalDays: null, daysSince: null, score: 0.2 });
      }
    }
  }
  picked.sort((a, b) => (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999) || b.score - a.score);
  return { stats, suggestions: picked };
}
