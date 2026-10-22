import { prisma } from "./db";
import { categoryDefs } from "./categories";

/** Make sure every code-defined category has a matching DB row (by slug). */
export async function ensureCategoriesSeeded() {
  for (const def of categoryDefs) {
    await prisma.category.upsert({
      where: { slug: def.slug },
      update: { label: def.label, description: def.description },
      create: { slug: def.slug, label: def.label, description: def.description },
    });
  }
}
