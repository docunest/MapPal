import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { camperCaller } from "@/lib/camper/auth";

export const maxDuration = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ALLOWED = new Set(["position", "floor_mode", "on_target", "auto_target", "dry", "diesel", "diesel_stop", "diesel_level", "diesel_cleanout", "dismiss"]);

// POST /api/camper/commands {action, ...} — queue a command from the /camper page.
// Same command format as the Z1's own /api/cmd.
export async function POST(req: Request) {
  const who = await camperCaller(req);
  if (!who) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string" || !ALLOWED.has(body.action)) return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  const cmd = await prisma.camperCommand.create({ data: { body: body as object, sentBy: who } });
  return NextResponse.json({ id: cmd.id });
}

// GET /api/camper/commands?wait=1 — the Z1's long-poll: hands out commands not
// taken yet (and marks them taken). Waits up to 25 s for one to arrive.
// Commands older than 10 min are dropped (never run a stale heater command).
export async function GET(req: Request) {
  if (!(await camperCaller(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const wait = new URL(req.url).searchParams.get("wait") === "1";
  const until = Date.now() + (wait ? 25_000 : 0);
  for (;;) {
    const fresh = new Date(Date.now() - 10 * 60_000);
    const cmds = await prisma.camperCommand.findMany({ where: { takenAt: null, createdAt: { gte: fresh } }, orderBy: { createdAt: "asc" }, take: 10 });
    if (cmds.length) {
      await prisma.camperCommand.updateMany({ where: { id: { in: cmds.map((c) => c.id) } }, data: { takenAt: new Date() } });
      return NextResponse.json({ commands: cmds.map((c) => ({ id: c.id, body: c.body })) });
    }
    if (Date.now() >= until) return NextResponse.json({ commands: [] });
    await sleep(1500);
  }
}
