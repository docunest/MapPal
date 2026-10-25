import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { isSourceId } from "@/lib/sources/registry";
import { clearSourceSettingsCache } from "@/lib/sources/settings";

const schema = z.object({ enabled: z.boolean() });

// PATCH /api/sources/:id {enabled} — the on/off switch on /sources.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSourceId(id)) return NextResponse.json({ error: "Unknown source" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected {enabled: boolean}" }, { status: 400 });
  const session = await auth();
  const updatedBy = session?.user?.name ?? session?.user?.email ?? undefined;
  try {
    await prisma.sourceSetting.upsert({
      where: { source: id },
      create: { source: id, enabled: parsed.data.enabled, updatedBy },
      update: { enabled: parsed.data.enabled, updatedBy },
    });
    clearSourceSettingsCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
