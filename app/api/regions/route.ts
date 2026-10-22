import { NextResponse } from "next/server";
import { z } from "zod";
import type { Polygon, MultiPolygon } from "geojson";
import { prisma } from "@/lib/db";
import { tilesForBoundary } from "@/lib/tiles";
import { ensureCategoriesSeeded } from "@/lib/ensureCategories";

const createRegionSchema = z.object({
  name: z.string().min(1),
  boundary: z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON coordinate nesting depth varies by Polygon/MultiPolygon
    coordinates: z.any() as z.ZodType<any>,
  }),
  h3Resolution: z.number().int().min(4).max(9).optional(),
});

export async function GET() {
  const regions = await prisma.region.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tiles: true } } },
  });
  return NextResponse.json({ regions });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = createRegionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, boundary, h3Resolution } = parsed.data;

  await ensureCategoriesSeeded();
  const categories = await prisma.category.findMany();

  const resolution = h3Resolution ?? 7;
  const tileSeeds = tilesForBoundary(boundary as unknown as Polygon | MultiPolygon, resolution);

  if (tileSeeds.length === 0) {
    return NextResponse.json(
      { error: "Drawn area produced no tiles — try drawing a larger shape." },
      { status: 400 },
    );
  }
  if (tileSeeds.length > 2000) {
    return NextResponse.json(
      {
        error: `Drawn area would produce ${tileSeeds.length} tiles at this resolution — draw a smaller area or use a coarser resolution.`,
      },
      { status: 400 },
    );
  }

  const region = await prisma.region.create({
    data: {
      name,
      boundary,
      h3Resolution: resolution,
      tiles: {
        create: tileSeeds.map((t) => ({
          h3Index: t.h3Index,
          centerLat: t.centerLat,
          centerLng: t.centerLng,
          boundary: t.boundary as object,
        })),
      },
    },
    include: { tiles: true },
  });

  // Seed the anti-skipping ledger: one job per tile x category, up front.
  await prisma.scanJob.createMany({
    data: region.tiles.flatMap((tile) =>
      categories.map((category) => ({ tileId: tile.id, categoryId: category.id })),
    ),
    skipDuplicates: true,
  });

  return NextResponse.json({ region });
}
