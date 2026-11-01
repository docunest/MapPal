import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { camperCaller } from "@/lib/camper/auth";

// GET  /api/camper/state — the /camper page: last state pushed by the Z1 plus
// the latest commands and their results.
// POST /api/camper/state {state, results?: [{id, ok, error?}]} — the Z1 pushes
// its snapshot (every ~20 s and right after running commands).
export async function GET(req: Request) {
  if (!(await camperCaller(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
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
}

export async function POST(req: Request) {
  if (!(await camperCaller(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { state?: unknown; results?: { id: string; ok: boolean; error?: string }[] } | null;
  if (!body || typeof body.state !== "object" || body.state === null) return NextResponse.json({ error: "Missing state" }, { status: 400 });
  await prisma.camperState.upsert({
    where: { id: "camper" },
    create: { id: "camper", state: body.state as object },
    update: { state: body.state as object },
  });
  for (const r of body.results ?? []) {
    await prisma.camperCommand.updateMany({ where: { id: String(r.id) }, data: { ok: !!r.ok, error: r.error ? String(r.error).slice(0, 300) : null } });
  }
  return NextResponse.json({ ok: true });
}
