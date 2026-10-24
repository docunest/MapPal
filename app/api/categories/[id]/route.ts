import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { categoryInputSchema } from "@/lib/categorySchema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ category });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = categoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.slug !== existing.slug) {
    const slugTaken = await prisma.category.findUnique({ where: { slug: parsed.data.slug } });
    if (slugTaken) {
      return NextResponse.json(
        { error: `A category with slug "${parsed.data.slug}" already exists` },
        { status: 409 },
      );
    }
  }

  const category = await prisma.category.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ category });
}
