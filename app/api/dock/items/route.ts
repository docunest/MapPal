import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { dockItemJson } from "@/lib/dock/items";
import { nameForPoint } from "@/lib/dock/resolve";

// GET /api/dock/items[?since=<ISO>] — the head unit's poll. Without `since`:
// everything (history is kept forever). With it: only items created or
// changed after it, so a poll every few seconds costs one indexed query.
// `now` is the server clock to send back as the next `since`.
export async function GET(req: Request) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return NextResponse.json({ error: "Bad since" }, { status: 400 });

  try {
    const now = new Date();
    const items = await prisma.dockItem.findMany({
      where: since ? { updatedAt: { gt: since } } : undefined,
      orderBy: { createdAt: "desc" },
      take: since ? 500 : 5000,
    });
    // Deletions: the head unit drops ids it no longer sees in a full sync.
    return NextResponse.json({ now: now.toISOString(), full: !since, items: items.map(dockItemJson) });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}

// POST /api/dock/items — "I like this place" from the head unit's GPS.
// The name is looked up here (OSM: nearest campsite/beach/viewpoint, then
// address); the head unit already saved it locally, so this can be slow.
const bookmarkSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  title: z.string().max(300).optional(),
  note: z.string().max(2000).optional(),
  from: z.string().max(100).optional(),
  // Client-made id so a retried upload (bad signal) doesn't duplicate it.
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});

export async function POST(req: Request) {
  const caller = await dockCaller(req);
  if (!caller) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const parsed = bookmarkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { lat, lng, title, note, from, clientId } = parsed.data;

  try {
    if (clientId) {
      const existing = await prisma.dockItem.findUnique({ where: { id: clientId } });
      if (existing) return NextResponse.json({ ok: true, item: dockItemJson(existing) });
    }
    const named = title ? { title, address: undefined } : await nameForPoint({ lat, lng });
    const item = await prisma.dockItem.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        kind: "bookmark",
        title: named.title,
        address: named.address,
        lat,
        lng,
        locatedBy: "gps",
        note,
        sentBy: from,
        // Made on the head unit: nothing "new" to pop up there.
        seenAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, item: dockItemJson(item) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
