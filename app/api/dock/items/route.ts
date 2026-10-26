import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { dockItemJson } from "@/lib/dock/items";
import { nameForPoint } from "@/lib/dock/resolve";

// Long-poll settings, controlled here (not in the APK): how long a request
// may wait for news, how often it checks the DB meanwhile, and how long the
// device pauses before asking again. Change via env without reinstalling.
export const maxDuration = 60;
function longPollConfig() {
  const num = (name: string, def: number, min: number, max: number) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && process.env[name]?.trim() ? Math.min(max, Math.max(min, v)) : def;
  };
  return {
    waitSeconds: num("DOCK_LONGPOLL_SECONDS", 25, 0, 50),
    checkMs: num("DOCK_LONGPOLL_CHECK_MS", 1000, 250, 10_000),
    delayMs: num("DOCK_POLL_DELAY_MS", 0, 0, 600_000),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET /api/dock/items[?since=<ISO>&wait=1] — the head unit's poll. Without
// `since`: everything (history is kept forever). With it: only items created
// or changed after it. With `wait=1` it's a long-poll: the server holds the
// request until something changes (checked every `checkMs` with one indexed
// query) or `waitSeconds` pass, so a link sent from the phone reaches the car
// in ~1 s. `now` is the server clock to send back as the next `since`; `next`
// tells the device when to ask again.
export async function GET(req: Request) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const sinceRaw = params.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return NextResponse.json({ error: "Bad since" }, { status: 400 });
  const cfg = longPollConfig();
  const deadline = Date.now() + (since && params.get("wait") ? cfg.waitSeconds * 1000 : 0);

  try {
    for (;;) {
      const now = new Date();
      const items = await prisma.dockItem.findMany({
        where: since ? { updatedAt: { gt: since } } : undefined,
        orderBy: { createdAt: "desc" },
        take: since ? 500 : 5000,
      });
      if (items.length || Date.now() + cfg.checkMs > deadline || req.signal.aborted) {
        // Deletions: the head unit drops ids it no longer sees in a full sync.
        return NextResponse.json({
          now: now.toISOString(),
          full: !since,
          items: items.map(dockItemJson),
          next: { waitSeconds: cfg.waitSeconds, delayMs: cfg.delayMs },
        });
      }
      await sleep(cfg.checkMs);
    }
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
