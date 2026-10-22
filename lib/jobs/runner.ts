import { prisma } from "../db";
import { categoryBySlug } from "../categories";
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

  const categoryDef = categoryBySlug[job.category.slug];
  if (!categoryDef) {
    await prisma.scanJob.update({
      where: { id: jobId },
      data: { status: "ERROR", error: `Unknown category slug: ${job.category.slug}` },
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
