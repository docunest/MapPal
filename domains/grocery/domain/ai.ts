// Stage 2 parsing + smart shortlist. Pure functions over a ChatJson, so the
// tests can use a fake model. Everything the model returns is validated against
// the real catalog/categories; anything invalid falls back to the local result.
import type { ParsedItem } from "./parse";
import type { CatalogItem } from "./text";
import { matchPhrase } from "./text";
import { PARSE_SYSTEM, PARSE_USER, SHORTLIST_SYSTEM, SHORTLIST_USER, render } from "./prompts";

/** Port: a JSON chat model (implemented by infrastructure/deepseek.ts, faked in tests). */
export type ChatJson = (purpose: string, system: string, user: string, opts?: { maxTokens?: number }) => Promise<unknown>;

export type CategoryInfo = { id: string; nameLt: string; nameEn: string; kind: "GROCERY" | "LONGTERM" };

export function categoriesBlock(categories: CategoryInfo[]): string {
  return categories.map((c) => `${c.id}: ${c.nameLt} / ${c.nameEn} [${c.kind}]`).join("\n");
}

export function catalogBlock(catalog: CatalogItem[]): string {
  return catalog
    .map((p) => `${p.id} | ${p.name} | ${[p.nameEn, ...p.aliases].filter(Boolean).join(", ")} | ${p.categoryId}`)
    .join("\n");
}

const str = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function parseWithAi(
  text: string,
  ctx: { catalog: CatalogItem[]; categories: CategoryInfo[]; listNames: string[] },
  chat: ChatJson,
): Promise<ParsedItem[]> {
  const system = render(PARSE_SYSTEM, { categories: categoriesBlock(ctx.categories), catalog: catalogBlock(ctx.catalog) });
  const user = render(PARSE_USER, { list: ctx.listNames.join(", ") || "(empty)", text: text.slice(0, 2000) });
  const reply = (await chat("parse", system, user, { maxTokens: 2500 })) as { items?: unknown[] };
  const byId = new Map(ctx.catalog.map((p) => [p.id, p]));
  const catIds = new Map(ctx.categories.map((c) => [c.id, c]));
  const out: ParsedItem[] = [];
  for (const raw of Array.isArray(reply?.items) ? reply.items : []) {
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;
    let known = typeof r.productId === "string" ? byId.get(r.productId) : undefined;
    // The model sometimes returns a known product as "new": catch exact matches.
    if (!known) {
      const m = matchPhrase(name, ctx.catalog);
      if (m && m.confidence >= 0.95) known = m.item;
    }
    const cat = typeof r.category === "string" && catIds.has(r.category) ? r.category : null;
    const kind = r.kind === "LONGTERM" || r.kind === "GROCERY" ? r.kind : cat ? catIds.get(cat)!.kind : null;
    const aliases = Array.isArray(r.aliases) ? r.aliases.map((a) => str(a, 40)).filter((a): a is string => !!a).slice(0, 5) : [];
    out.push({
      action: r.action === "remove" ? "remove" : "add",
      productId: known?.id ?? null,
      name: known?.name ?? name.toLowerCase(),
      nameEn: known ? known.nameEn : str(r.nameEn),
      aliases,
      categoryId: known?.categoryId ?? cat ?? "kita",
      kind: known?.kind ?? kind ?? "GROCERY",
      qty: str(r.qty, 20),
      note: str(r.note, 80),
      heard: str(r.heard, 120) ?? name,
      forDish: str(r.forDish, 40)?.toLowerCase() ?? null,
      isNew: !known,
      confidence: known ? 0.9 : 0.8,
      source: "ai",
    });
  }
  return out;
}

export type HistoryRow = { id: string; name: string; categoryId: string; kind: string; count: number; intervalDays: number | null; daysSince: number | null };

export async function shortlistWithAi(
  ctx: { history: HistoryRow[]; staples: { id: string; name: string }[]; listNames: string[]; max?: number },
  chat: ChatJson,
): Promise<{ items: { productId: string; reason: string }[]; tips: string[] }> {
  const system = render(SHORTLIST_SYSTEM, { max: ctx.max ?? 15 });
  const user = render(SHORTLIST_USER, {
    today: new Date().toISOString().slice(0, 10),
    history:
      ctx.history
        .map((h) => `${h.id} | ${h.name} | ${h.categoryId}${h.kind === "LONGTERM" ? " (LONGTERM)" : ""} | ${h.count} | ${h.intervalDays ?? "-"} | ${h.daysSince ?? "-"}`)
        .join("\n") || "(no history yet)",
    staples: ctx.staples.map((s) => `${s.id} | ${s.name}`).join("\n") || "(none)",
    list: ctx.listNames.join(", ") || "(empty)",
  });
  const reply = (await chat("shortlist", system, user, { maxTokens: 1500 })) as { items?: unknown[]; tips?: unknown[] };
  const valid = new Set([...ctx.history.map((h) => h.id), ...ctx.staples.map((s) => s.id)]);
  const items = (Array.isArray(reply?.items) ? reply.items : [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.productId === "string" && valid.has(r.productId))
    .map((r) => ({ productId: r.productId as string, reason: str(r.reason, 100) ?? "" }));
  const tips = (Array.isArray(reply?.tips) ? reply.tips : []).map((t) => str(t, 140)).filter((t): t is string => !!t).slice(0, 2);
  return { items, tips };
}
