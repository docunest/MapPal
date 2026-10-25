import { NextResponse } from "next/server";
import { describeDbError } from "@/lib/dbErrors";
import { PLACEHOLDERS } from "@/lib/prompts/placeholders";
import { listTemplates } from "@/lib/prompts/store";

// GET /api/prompts — all shared templates with recent versions + the allowed placeholders.
export async function GET() {
  try {
    return NextResponse.json({ templates: await listTemplates(), placeholders: PLACEHOLDERS });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
