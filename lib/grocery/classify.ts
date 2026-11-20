// A typed item the catalog didn't know lands in "Kita" at once (no waiting);
// right after the response DeepSeek files it in the right section, or — if it
// is really a known product spelled differently — merges it into that one and
// keeps the spelling as an alias.
import { prisma } from "../db";
import { aiConfigured, deepseekChatJson } from "./llm/deepseek";
import { parseWithAi } from "./llm/ai";
import { loadCatalog } from "./store";

export async function classifyProducts(productIds: string[]): Promise<void> {
  if (!aiConfigured() || !productIds.length) return;
  const { products, categories } = await loadCatalog();
  for (const id of productIds) {
    const p = products.find((x) => x.id === id);
    if (!p) continue;
    try {
      const others = products.filter((x) => x.id !== id);
      const [r] = await parseWithAi(p.name, { catalog: others, categories, listNames: [] }, deepseekChatJson);
      if (!r) continue;
      if (r.productId && r.productId !== id) {
        const target = others.find((x) => x.id === r.productId)!;
        await prisma.$transaction([
          prisma.groceryEntry.updateMany({ where: { productId: id }, data: { productId: target.id, name: target.name, categoryId: target.categoryId, kind: target.kind } }),
          prisma.groceryProduct.update({ where: { id: target.id }, data: { aliases: [...new Set([...target.aliases, p.name])], updatedAt: new Date() } }),
          prisma.groceryProduct.update({ where: { id }, data: { hidden: true, updatedAt: new Date() } }),
        ]);
      } else if (r.categoryId) {
        await prisma.groceryProduct.update({
          where: { id },
          data: { categoryId: r.categoryId, kind: r.kind ?? "GROCERY", nameEn: r.nameEn ?? undefined, source: "ai", updatedAt: new Date() },
        });
        await prisma.groceryEntry.updateMany({ where: { productId: id, archived: false }, data: { categoryId: r.categoryId, kind: r.kind ?? "GROCERY" } });
      }
    } catch (err) {
      console.error("[grocery] classify failed", id, err);
    }
  }
}
