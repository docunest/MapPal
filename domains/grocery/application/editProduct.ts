import type { ProductPatch } from "../domain/types";
import { updateProduct } from "../infrastructure/repo";

export async function editProduct(id: string, patch: ProductPatch) {
  const p = await updateProduct(id, patch);
  return { id: p.id, name: p.name, aliases: p.aliases, categoryId: p.categoryId, kind: p.kind, hidden: p.hidden };
}
