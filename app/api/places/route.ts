import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const regionId = searchParams.get("regionId");
  const categorySlug = searchParams.get("category");

  if (!regionId) {
    return NextResponse.json({ error: "regionId is required" }, { status: 400 });
  }

  const places = await prisma.place.findMany({
    where: {
      tile: { regionId },
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    include: { category: true, sources: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ places });
}
