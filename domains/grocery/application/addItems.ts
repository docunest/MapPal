import type { AddInput } from "../domain/types";
import { addItems as addToList, removeByProduct } from "../infrastructure/repo";

const VIA = new Set(["typed", "pick", "suggest", "ai", "mcp"]);

export type AddRequest = AddInput & { action?: "add" | "remove" | string };

/**
 * Put things on the list (or take them off for "remove" items, e.g. "pieno
 * nebereikia"). Returns the product ids that were created in "Kita" by hand:
 * the caller files them with classifyNew() after replying.
 */
export async function addItems(items: AddRequest[], member: string | null, via: string) {
  const v = VIA.has(via) ? via : "typed";
  const removeIds = items.filter((i) => i.action === "remove" && i.productId).map((i) => i.productId!);
  const removed = removeIds.length ? await removeByProduct(removeIds) : 0;
  const results = await addToList(items.filter((i) => i.action !== "remove").slice(0, 100), member, v);
  const toClassify = results.filter((r) => r.createdProduct && r.entry.categoryId === "kita").map((r) => r.entry.productId!);
  return { results, removed, toClassify };
}
