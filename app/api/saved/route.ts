import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";

// The shared family trip list — everyone sees and edits the same spots.
export async function GET() {
  try {
    const spots = await prisma.savedSpot.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ spots });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}

const saveSchema = z.object({
  name: z.string().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: z.string().min(1).max(60),
  sourceKey: z.string().min(1).max(200),
  wikidata: z.string().regex(/^Q\d+$/).optional(),
  imageUrl: z.string().url().max(1000).optional(),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const session = await auth();
  const savedBy = session?.user?.name ?? session?.user?.email ?? undefined;
  const { sourceKey, ...data } = parsed.data;
  try {
    // Saving something already on the list just brings it back to "must visit".
    const spot = await prisma.savedSpot.upsert({
      where: { sourceKey },
      create: { sourceKey, ...data, savedBy },
      update: { status: "MUST_VISIT", ...(data.note ? { note: data.note } : {}) },
    });
    return NextResponse.json({ spot });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
