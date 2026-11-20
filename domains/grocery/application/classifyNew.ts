// A typed item the catalog didn't know lands in "Kita" at once (no waiting);
// right after the response DeepSeek files it in the right section, or — if it
// is really a known product spelled differently — merges it into that one and
// keeps the spelling as an alias.
import { aiConfigured, deepseekChatJson } from "../infrastructure/deepseek";
import { parseWithAi } from "../domain/ai";
import { fileProduct, loadCatalog, mergeProductInto } from "../infrastructure/repo";

export async function classifyNew(productIds: string[]): Promise<void> {
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
        await mergeProductInto(id, target);
      } else if (r.categoryId) {
        await fileProduct(id, { categoryId: r.categoryId, kind: r.kind ?? "GROCERY", nameEn: r.nameEn ?? null });
      }
    } catch (err) {
      console.error("[grocery] classify failed", id, err);
    }
  }
}
