import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { camperCaller } from "@/lib/camper/auth";
import { describeDbError } from "@/lib/dbErrors";

// GET /api/camper/history?hours=24 — 5-min samples and on/off/command events
// recorded by the Z1 (see POST /api/camper/state). Up to 31 days at a time.
export async function GET(req: Request) {
  if (!(await camperCaller(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  try {
    const hours = Math.min(Math.max(Number(new URL(req.url).searchParams.get("hours")) || 24, 1), 24 * 31);
    const since = new Date(Date.now() - hours * 3_600_000);
    const [samples, events] = await Promise.all([
      prisma.camperSample.findMany({ where: { ts: { gte: since } }, orderBy: { ts: "asc" } }),
      prisma.camperEvent.findMany({ where: { ts: { gte: since } }, orderBy: { ts: "desc" }, take: 1000 }),
    ]);
    return NextResponse.json({
      hours,
      now: Math.floor(Date.now() / 1000),
      samples: samples.map((s) => ({ t: Math.floor(s.ts.getTime() / 1000), ...(s.data as object) })),
      events: events.map((e) => ({ t: Math.floor(e.ts.getTime() / 1000), device: e.device, what: e.what, value: e.value, by: e.by })),
    });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
