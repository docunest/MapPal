import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureCategoriesSeeded } from "@/lib/ensureCategories";

export async function GET() {
  await ensureCategoriesSeeded();
  const categories = await prisma.category.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json({ categories });
}
