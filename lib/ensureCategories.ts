import { prisma } from "./db";
import { categoryDefs } from "./categories";

/**
 * First-run only: create a DB row for each code-defined default category if
 * it doesn't exist yet. Never updates an existing row — once a category
 * exists, the DB is the source of truth and /categories edits must stick,
 * not get silently reverted back to the code defaults on the next request.
 */
export async function ensureCategoriesSeeded() {
  for (const def of categoryDefs) {
    const existing = await prisma.category.findUnique({ where: { slug: def.slug } });
    if (existing) continue;

    await prisma.category.create({
      data: {
        slug: def.slug,
        label: def.label,
        description: def.description,
        elementTypes: def.elementTypes,
        overpassFilters: def.overpassFilters as object,
        include: def.include,
        exclude: def.exclude,
        searchPhrases: def.searchPhrases,
        extractFields: def.extractFields,
      },
    });
  }
}
