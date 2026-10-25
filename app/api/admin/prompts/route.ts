import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { describeDbError } from "@/lib/dbErrors";
import { PLACEHOLDERS } from "@/lib/prompts/placeholders";
import { listTemplates } from "@/lib/prompts/store";

// Agent access to the shared prompt templates (x-admin-secret header).
// GET /api/admin/prompts — read all templates and the allowed placeholders.
export async function GET(req: Request) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ templates: await listTemplates(), placeholders: PLACEHOLDERS });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
