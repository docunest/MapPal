import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { describeDbError } from "@/lib/dbErrors";
import { applyPendingMigrations } from "@/lib/migrate";

// Manual trigger for the same migrator every server start runs
// (instrumentation.ts → lib/migrate.ts). Normally not needed any more.

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, results: await applyPendingMigrations() });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
