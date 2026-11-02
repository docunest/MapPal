import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { camperCaller } from "@/lib/camper/auth";
import { describeDbError } from "@/lib/dbErrors";

type Sample = { t: number } & Record<string, unknown>;
type Event = { t: number; device: string; what: string; value?: unknown; by?: string | null };

const KEEP_DAYS = 365;
const str = (v: unknown) => (v === null || v === undefined ? null : String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 300));

async function storeHistory(samples: Sample[], events: Event[]) {
  const ok = (t: unknown) => typeof t === "number" && t > 1_600_000_000 && t < Date.now() / 1000 + 3600;
  const rows = samples.filter((r) => ok(r?.t)).slice(0, 500);
  if (rows.length) {
    await prisma.camperSample.createMany({
      data: rows.map(({ t, ...data }) => ({ ts: new Date(t * 1000), data: data as object })),
      skipDuplicates: true,
    });
  }
  const evs = events.filter((e) => ok(e?.t) && e.device && e.what).slice(0, 500);
  if (evs.length) {
    await prisma.camperEvent.createMany({
      data: evs.map((e) => ({
        id: `${e.t}-${e.device}-${e.what}`.slice(0, 120),
        ts: new Date(e.t * 1000),
        device: String(e.device).slice(0, 40),
        what: String(e.what).slice(0, 40),
        value: str(e.value),
        by: str(e.by),
      })),
      skipDuplicates: true,
    });
  }
  // housekeeping now and then (a push comes every ~20 s)
  if (Math.random() < 0.002) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
    await prisma.camperSample.deleteMany({ where: { ts: { lt: cutoff } } });
    await prisma.camperEvent.deleteMany({ where: { ts: { lt: cutoff } } });
  }
}

// GET  /api/camper/state — the /camper page: last state pushed by the Z1 plus
// the latest commands and their results.
// POST /api/camper/state {state, results?: [{id, ok, error?}], samples?, events?}
// — the Z1 pushes its snapshot (every ~20 s and right after running commands)
// plus history rows it hasn't uploaded yet. The reply's lastSample/lastEvent
// (epoch s of the newest stored rows) tell the Z1 where to continue.
export async function GET(req: Request) {
  if (!(await camperCaller(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  try {
    const [row, commands] = await Promise.all([
      prisma.camperState.findUnique({ where: { id: "camper" } }),
      prisma.camperCommand.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
    return NextResponse.json({
      state: row?.state ?? null,
      updatedAt: row?.updatedAt ?? null,
      now: new Date(),
      commands: commands.map((c) => ({ id: c.id, body: c.body, takenAt: c.takenAt, ok: c.ok, error: c.error, createdAt: c.createdAt })),
    });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await camperCaller(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => null)) as {
      state?: unknown;
      results?: { id: string; ok: boolean; error?: string }[];
      samples?: Sample[];
      events?: Event[];
    } | null;
    if (!body || typeof body.state !== "object" || body.state === null) return NextResponse.json({ error: "Missing state" }, { status: 400 });
    await prisma.camperState.upsert({
      where: { id: "camper" },
      create: { id: "camper", state: body.state as object },
      update: { state: body.state as object },
    });
    for (const r of body.results ?? []) {
      await prisma.camperCommand.updateMany({ where: { id: String(r.id) }, data: { ok: !!r.ok, error: r.error ? String(r.error).slice(0, 300) : null } });
    }
    await storeHistory(body.samples ?? [], body.events ?? []);
    const [lastSample, lastEvent] = await Promise.all([
      prisma.camperSample.findFirst({ orderBy: { ts: "desc" }, select: { ts: true } }),
      prisma.camperEvent.findFirst({ orderBy: { ts: "desc" }, select: { ts: true } }),
    ]);
    const s = (d?: { ts: Date } | null) => (d ? Math.floor(d.ts.getTime() / 1000) : 0);
    return NextResponse.json({ ok: true, lastSample: s(lastSample), lastEvent: s(lastEvent) });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
