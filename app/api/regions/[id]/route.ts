import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const region = await prisma.region.findUnique({
    where: { id },
    include: { tiles: true },
  });
  if (!region) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ region });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.region.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
