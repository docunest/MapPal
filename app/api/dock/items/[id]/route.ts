import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { dockItemJson } from "@/lib/dock/items";

// PATCH — head unit reports "seen" (pop-up shown) / "opened" (navigated),
// or someone renames, pins or annotates an item.
const patchSchema = z.object({
  seen: z.literal(true).optional(),
  opened: z.literal(true).optional(),
  title: z.string().min(1).max(300).optional(),
  note: z.string().max(2000).nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { seen, opened, ...rest } = parsed.data;
  const now = new Date();
  try {
    const current = await prisma.dockItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const item = await prisma.dockItem.update({
      where: { id },
      data: {
        ...rest,
        ...(seen && !current.seenAt ? { seenAt: now } : {}),
        ...(opened ? { openedAt: now, openCount: { increment: 1 }, seenAt: current.seenAt ?? now } : {}),
      },
    });
    return NextResponse.json({ item: dockItemJson(item) });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const { id } = await params;
  try {
    await prisma.dockItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
