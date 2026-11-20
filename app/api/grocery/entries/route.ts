import { after } from "next/server";
import { api, body, BadRequest } from "@/lib/grocery/http";
import { addItems, removeByProduct, type AddInput } from "@/lib/grocery/store";
import { classifyProducts } from "@/lib/grocery/classify";

const VIA = new Set(["typed", "pick", "suggest", "ai", "mcp"]);

export const POST = api(async ({ req, member }) => {
  const b = await body<{ items?: (AddInput & { action?: string })[]; via?: string }>(req);
  if (!Array.isArray(b.items) || !b.items.length) throw new BadRequest("items[] required");
  const via = VIA.has(b.via ?? "") ? b.via! : "typed";
  const removeIds = b.items.filter((i) => i.action === "remove" && i.productId).map((i) => i.productId!);
  const removed = removeIds.length ? await removeByProduct(removeIds) : 0;
  const results = await addItems(b.items.filter((i) => i.action !== "remove").slice(0, 100), member, via);
  // New items typed by hand land in "Kita"; DeepSeek files them after the reply.
  const toClassify = results.filter((r) => r.createdProduct && r.entry.categoryId === "kita").map((r) => r.entry.productId!);
  if (toClassify.length) after(() => classifyProducts(toClassify));
  return { results, removed };
});
