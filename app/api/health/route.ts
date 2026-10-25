import { NextResponse } from "next/server";
import { blockingProblems } from "@/lib/config";

// GET /api/health — public (the login screen needs it before anyone can log
// in). Only says what's missing/broken by name; never returns values.
export async function GET() {
  const problems = await blockingProblems();
  return NextResponse.json({ ok: problems.length === 0, problems }, { headers: { "Cache-Control": "no-store" } });
}
