import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { dockCaller } from "@/lib/dock/auth";
import { inboxLogJson } from "@/lib/dock/inbox";

// GET /api/dock/inbox/log — the newest requests the inbox received (secrets
// stripped), for setting up phone share shortcuts.
export async function GET(req: Request) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  try {
    const logs = await prisma.dockInboxLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ logs: logs.map(inboxLogJson) });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
