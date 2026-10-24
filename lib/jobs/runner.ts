import { prisma } from "../db";
import type { CategoryDef, OverpassElementType, OverpassTagFilter } from "../categories/types";
import { bboxOfHex } from "../tiles";
import { runOverpassCollector } from "../collectors/overpass";

/**
 * Process a single (tile x category) job: run every available collector,
 * upsert Place + PlaceSource rows, and record exactly what ran — so the
 * coverage dashboard can show "done, N sources, M candidates" instead of
 * silence. This is the piece that makes skipped areas visible.
 */
export async function runJob(jobId: string): Promise<void> {
  const job = await prisma.scanJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { tile: true, category: true },
  });

  // Category rules live in the DB now (editable via /categories), not in
  // code — only elementTypes/overpassFilters are actually read here; the
  // rest (include/exclude/searchPhrases) isn't used by any collector yet.
  const categoryDef: CategoryDef = {
    slug: job.category.slug,
    label: job.category.label,
    description: job.category.description,
    elementTypes: job.category.elementTypes as unknown as OverpassElementType[],
    overpassFilters: job.category.overpassFilters as unknown as OverpassTagFilter[],
    include: job.category.include as unknown as string[],
    exclude: job.category.exclude as unknown as string[],
    searchPhrases: job.category.searchPhrases as unknown as string[],
    extractFields: job.category.extractFields as unknown as string[],
  };

  if (!categoryDef.elementTypes?.length || !categoryDef.overpassFilters?.length) {
    await prisma.scanJob.update({
      where: { id: jobId },
      data: { status: "ERROR", error: `Category "${job.category.slug}" has no OSM tag filters configured` },
    });
    return;
  }

  await prisma.scanJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const sourcesTried: string[] = [];
  let candidateCount = 0;

  try {
    const bbox = bboxOfHex(job.tile.h3Index);

    sourcesTried.push("osm-overpass");
    const candidates = await runOverpassCollector(categoryDef, bbox);
    candidateCount = candidates.length;

    for (const c of candidates) {
      const osmKey = `${c.osmType}/${c.osmId}`;

      const existingSource = await prisma.placeSource.findFirst({
        where: { type: "osm", url: osmKey },
        select: { placeId: true },
      });

      if (existingSource) {
        await prisma.place.update({
          where: { id: existingSource.placeId },
          data: { lastVerifiedAt: new Date() },
        });
        continue;
      }

      await prisma.place.create({
        data: {
          name: c.name,
          categoryId: job.categoryId,
          tileId: job.tileId,
          lat: c.lat,
          lng: c.lng,
          description: describeFromTags(c.tags),
          confidence: 0.5, // unverified: structured source only, no LLM check yet
          sources: {
            create: {
              type: "osm",
              url: osmKey,
              raw: c.tags,
            },
          },
        },
      });
    }

    await prisma.scanJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        sourcesTried,
        candidateCount,
      },
    });
  } catch (err) {
    await prisma.scanJob.update({
      where: { id: jobId },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        sourcesTried,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

function describeFromTags(tags: Record<string, string>): string | undefined {
  const bits: string[] = [];
  if (tags.operator) bits.push(`operator: ${tags.operator}`);
  if (tags.product) bits.push(`product: ${tags.product}`);
  if (tags["disused:man_made"] || tags["abandoned:man_made"]) bits.push("disused/abandoned");
  return bits.length ? bits.join(", ") : undefined;
}

/** Pick up to `limit` pending jobs and run them sequentially. */
export async function runPendingJobs(limit = 5): Promise<{ ran: number }> {
  const pending = await prisma.scanJob.findMany({
    where: { status: "PENDING" },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  for (const job of pending) {
    await runJob(job.id);
  }

  return { ran: pending.length };
}
