import { prisma } from "../db";
import { SEED_CATEGORIES, seedProducts } from "./seed-data";

/** Insert missing seed categories/products. Never overwrites the family's edits. */
export async function seedCatalog(): Promise<void> {
  const existing = await prisma.groceryCategory.count();
  if (existing < SEED_CATEGORIES.length) {
    await prisma.groceryCategory.createMany({
      data: SEED_CATEGORIES.map((c, i) => ({ id: c.id, nameLt: c.nameLt, nameEn: c.nameEn, emoji: c.emoji, kind: c.kind, sortOrder: (i + 1) * 10 })),
      skipDuplicates: true,
    });
  }
  const seeds = seedProducts();
  const have = await prisma.groceryProduct.count({ where: { source: "seed" } });
  if (have < seeds.length) {
    await prisma.groceryProduct.createMany({ data: seeds.map((p) => ({ ...p, source: "seed" })), skipDuplicates: true });
  }
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
