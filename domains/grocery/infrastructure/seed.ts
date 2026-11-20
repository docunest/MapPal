import { prisma } from "@/lib/db";
import { SEED_CATEGORIES, seedProducts } from "../domain/seed-data";

/** Insert missing seed categories/products. Never overwrites the family's edits. */
export async function seedCatalog(): Promise<void> {
  // Always offer every seed row: skipDuplicates keeps existing ones (and the
  // family's edits/removals) as they are, so the catalog can also shrink or
  // move items without a count check missing new ones.
  {
    await prisma.groceryCategory.createMany({
      data: SEED_CATEGORIES.map((c, i) => ({ id: c.id, nameLt: c.nameLt, nameEn: c.nameEn, emoji: c.emoji, kind: c.kind, sortOrder: (i + 1) * 10 })),
      skipDuplicates: true,
    });
  }
  await prisma.groceryProduct.createMany({ data: seedProducts().map((p) => ({ ...p, source: "seed" })), skipDuplicates: true });
}

let ready: Promise<void> | null = null;

/** Seed catalog once per server instance (tables come from MapPal's migrations). */
export function ensureReady(): Promise<void> {
  ready ??= seedCatalog().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
