import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const regionId = searchParams.get("regionId");
  if (!regionId) {
    return NextResponse.json({ error: "regionId is required" }, { status: 400 });
  }

  const jobs = await prisma.scanJob.findMany({
    where: { tile: { regionId } },
    include: { category: true, tile: { select: { id: true, h3Index: true } } },
  });

  const summary = jobs.reduce(
    (acc, j) => {
      acc.total += 1;
      acc.byStatus[j.status] = (acc.byStatus[j.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> },
  );

  return NextResponse.json({ jobs, summary });
}
