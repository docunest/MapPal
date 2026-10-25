import { NextResponse } from "next/server";
import { databaseCheck, envChecks } from "@/lib/config";

// GET /api/config — signed-in users: every server setting by name with
// yes/no and what it affects, plus the database check. No values.
export async function GET() {
  const [env, database] = [envChecks(), await databaseCheck()];
  return NextResponse.json({ ...env, database }, { headers: { "Cache-Control": "no-store" } });
}
