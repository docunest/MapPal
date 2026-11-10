import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { capBytes, excessBytes, rowsFor, uploadSchema } from "@/lib/dock/logs";

// POST — the head unit's debug log lines (dock token). Idempotent per
// (device, seq). After each upload the table is trimmed, oldest first, so
// the kept text stays under the cap (lib/dock/logs.ts).
export async function POST(req: Request) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const { count } = await prisma.dockLog.createMany({ data: rowsFor(parsed.data.device, parsed.data.lines), skipDuplicates: true });
    const [{ total }] = await prisma.$queryRaw<Array<{ total: bigint | null }>>`SELECT SUM("bytes")::bigint AS total FROM "mappal_dock_log"`;
    const excess = excessBytes(Number(total ?? 0), capBytes());
    let trimmed = 0;
    if (excess > 0) {
      trimmed = await prisma.$executeRaw`
        DELETE FROM "mappal_dock_log" WHERE "id" <= (
          SELECT "id" FROM (SELECT "id", SUM("bytes") OVER (ORDER BY "id") AS run FROM "mappal_dock_log") t
          WHERE run >= ${excess} ORDER BY "id" LIMIT 1
        )`;
      // Make the freed space reusable now (doesn't shrink the file, keeps it from growing). Best effort.
      await prisma.$executeRawUnsafe(`VACUUM "mappal_dock_log"`).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, stored: count, trimmed, totalBytes: Number(total ?? 0) });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}

// GET — read back (dock token or MapPal login): newest first.
//   ?tag=GPS  ?since=2026-11-10T10:00:00Z  ?until=…  ?q=text  ?limit=500 (max 5000)  ?format=text
export async function GET(req: Request) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const u = new URL(req.url).searchParams;
  const limit = Math.min(5000, Math.max(1, Number(u.get("limit")) || 500));
  const since = u.get("since") ? new Date(u.get("since")!) : undefined;
  const until = u.get("until") ? new Date(u.get("until")!) : undefined;
  try {
    const rows = await prisma.dockLog.findMany({
      where: {
        ...(u.get("tag") ? { tag: u.get("tag")! } : {}),
        ...(u.get("q") ? { msg: { contains: u.get("q")!, mode: "insensitive" as const } } : {}),
        ...(since || until ? { at: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } } : {}),
      },
      orderBy: [{ at: "desc" }, { seq: "desc" }],
      take: limit,
    });
    if (u.get("format") === "text") {
      const text = rows.map((r) => `${r.at.toISOString()} ${r.tag.padEnd(5)} ${r.msg}`).join("\n");
      return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const [{ total, n }] = await prisma.$queryRaw<Array<{ total: bigint | null; n: bigint }>>`SELECT SUM("bytes")::bigint AS total, COUNT(*)::bigint AS n FROM "mappal_dock_log"`;
    return NextResponse.json({
      totalBytes: Number(total ?? 0),
      capBytes: capBytes(),
      rows: Number(n),
      lines: rows.map((r) => ({ at: r.at.toISOString(), device: r.device, seq: Number(r.seq), tag: r.tag, msg: r.msg })),
    });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
