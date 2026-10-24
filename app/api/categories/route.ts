import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureCategoriesSeeded } from "@/lib/ensureCategories";
import { categoryInputSchema } from "@/lib/categorySchema";

export async function GET() {
  await ensureCategoriesSeeded();
  const categories = await prisma.category.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = categoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return NextResponse.json({ error: `A category with slug "${parsed.data.slug}" already exists` }, { status: 409 });
  }

  const category = await prisma.category.create({ data: parsed.data });
  return NextResponse.json({ category }, { status: 201 });
}
