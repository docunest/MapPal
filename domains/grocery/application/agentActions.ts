// What an assistant can do with the list — shared by the MCP server
// (application/mcp.ts) and the REST API for OpenAPI actions (app/api/grocery/v1),
// so both behave the same. Items are referred to by name (any language) or id.
import { autocomplete, matchPhrase, type CatalogItem } from "../domain/text";
import type { EntryDto } from "../domain/types";
import { aiConfigured } from "../infrastructure/deepseek";
import { loadCatalog, loadState } from "../infrastructure/repo";
import { addItems, type AddRequest } from "./addItems";
import { classifyNew } from "./classifyNew";
import { finishTrip } from "./finishTrip";
import { parseText } from "./parseText";
import { suggestFromHistory } from "./suggestFromHistory";
import { suggestWithAi } from "./suggestWithAi";
import { updateEntry } from "./updateEntry";

export type AgentItem = {
  id: string;
  name: string;
  qty: string | null;
  note: string | null;
  section: string;
  sectionLt: string;
  longTerm: boolean;
  bought: boolean;
  addedBy: string | null;
  boughtBy: string | null;
};

/** The list in supermarket aisle order (groceries first, then long-term). */
export async function listForAgent(includeBought = true) {
  const { entries, categories, trip } = await loadState();
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const items: AgentItem[] = entries
    .filter((e) => includeBought || e.status === "OPEN")
    .sort((a, b) => Number(a.kind === "LONGTERM") - Number(b.kind === "LONGTERM") || (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999) || a.name.localeCompare(b.name, "lt"))
    .map((e) => ({
      id: e.id,
      name: e.name,
      qty: e.qty,
      note: e.note,
      section: cat.get(e.categoryId)?.nameEn ?? e.categoryId,
      sectionLt: cat.get(e.categoryId)?.nameLt ?? e.categoryId,
      longTerm: e.kind === "LONGTERM",
      bought: e.status === "BOUGHT",
      addedBy: e.addedBy,
      boughtBy: e.boughtBy,
    }));
  const toBuy = items.filter((i) => !i.bought).length;
  return { toBuy, trip: trip ? { startedAt: trip.startedAt, startedBy: trip.startedBy } : null, items };
}

export type AddArgs = { text?: unknown; items?: unknown };

/** Free text (any language, parsed + matched + classified) and/or explicit items. */
export async function addForAgent(args: AddArgs, who: string, via = "mcp") {
  const { products } = await loadCatalog();
  const input: AddRequest[] = [];
  let parsedBy: "local" | "ai" | "none" = "none";
  if (typeof args.text === "string" && args.text.trim()) {
    const parsed = await parseText(args.text);
    parsedBy = parsed.mode;
    input.push(...parsed.items.map((i) => ({ ...i, categoryId: i.categoryId ?? null })));
  }
  if (Array.isArray(args.items)) {
    for (const raw of args.items as Record<string, unknown>[]) {
      if (typeof raw?.name !== "string" || !raw.name.trim()) continue;
      const m = matchPhrase(raw.name, products);
      const longTerm = raw.long_term === true || raw.longTerm === true;
      input.push({
        name: raw.name.trim(),
        productId: m && m.confidence >= 0.75 ? m.item.id : null,
        qty: typeof raw.qty === "string" ? raw.qty : null,
        note: typeof raw.note === "string" ? raw.note : null,
        kind: longTerm ? "LONGTERM" : null,
        categoryId: longTerm ? "ilgalaikiai" : null,
      });
    }
  }
  const { results, removed, toClassify } = await addItems(input, who, via);
  if (toClassify.length) await classifyNew(toClassify);
  const view = (e: EntryDto) => ({ id: e.id, name: e.name, qty: e.qty });
  return {
    added: results.filter((r) => !r.merged).map((r) => ({ ...view(r.entry), newProduct: r.createdProduct })),
    alreadyOnList: results.filter((r) => r.merged).map((r) => view(r.entry)),
    removed,
    parsedBy,
  };
}

function findEntries(refs: string[], entries: EntryDto[], products: CatalogItem[]): { hit: EntryDto[]; missing: string[] } {
  // Match against the product's English name and aliases too ("potatoes" → bulvės).
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const asCatalog: CatalogItem[] = entries.map((e) => {
    const p = e.productId ? byProduct.get(e.productId) : undefined;
    return { id: e.id, name: e.name, nameEn: p?.nameEn, aliases: p?.aliases ?? [], categoryId: e.categoryId, kind: e.kind };
  });
  const hit: EntryDto[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const byId = entries.find((e) => e.id === ref);
    const m = byId ? null : matchPhrase(ref, asCatalog);
    const e = byId ?? (m && m.confidence >= 0.6 ? entries.find((x) => x.id === m.item.id) : undefined);
    if (e) hit.push(e);
    else missing.push(ref);
  }
  return { hit, missing };
}

const refsOf = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x): x is string => typeof x === "string" && !!x.trim());

/** Cross out (bought=true) or put back (bought=false), by name or id. */
export async function markForAgent(items: unknown, bought: boolean, who: string) {
  const [{ entries }, { products }] = await Promise.all([loadState(), loadCatalog()]);
  // The same product can be on the list twice (one already crossed out on this
  // trip, one still to buy): cross out an open one, put back a bought one.
  const want = bought ? "OPEN" : "BOUGHT";
  const preferred = entries.filter((e) => e.status === want);
  const { hit, missing } = findEntries(refsOf(items), preferred.length ? preferred : entries, products);
  for (const e of hit) await updateEntry(e.id, { status: bought ? "BOUGHT" : "OPEN" }, who);
  return { done: hit.map((e) => ({ id: e.id, name: e.name })), notOnList: missing };
}

export async function removeForAgent(items: unknown, who: string) {
  const [{ entries }, { products }] = await Promise.all([loadState(), loadCatalog()]);
  const open = entries.filter((e) => e.status === "OPEN");
  const { hit, missing } = findEntries(refsOf(items), open.length ? open : entries, products);
  for (const e of hit) await updateEntry(e.id, { status: "REMOVED" }, who);
  return { removed: hit.map((e) => ({ id: e.id, name: e.name })), notOnList: missing };
}

export async function finishForAgent(who: string) {
  const r = await finishTrip(who);
  return { bought: r.bought, stayOnList: r.carried, longTerm: r.longTerm };
}

export async function suggestForAgent(useAi: boolean) {
  if (useAi && aiConfigured()) {
    const r = await suggestWithAi();
    return { source: "ai" as const, items: r.items.map((i) => ({ productId: i.productId, name: i.name, reason: i.reason })), tips: r.tips };
  }
  const { suggestions } = await suggestFromHistory();
  return {
    source: "history" as const,
    items: suggestions.map((s) => ({
      productId: s.productId,
      name: s.name,
      reason: s.reason === "due" ? `every ~${s.intervalDays} d, last ${s.daysSince} d ago` : s.reason === "staple" ? "staple" : `bought ${s.daysSince} d ago`,
    })),
    tips: [] as string[],
  };
}

export async function searchCatalogForAgent(query: string) {
  const { products, categories } = await loadCatalog();
  const cat = new Map(categories.map((c) => [c.id, c]));
  return {
    products: autocomplete(query, products, 10).map((h) => ({
      id: h.item.id,
      name: h.item.name,
      nameEn: h.item.nameEn ?? null,
      aliases: h.item.aliases,
      section: cat.get(h.item.categoryId)?.nameEn ?? h.item.categoryId,
      longTerm: h.item.kind === "LONGTERM",
    })),
  };
}
