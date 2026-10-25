import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminAuth";
import { describeDbError } from "@/lib/dbErrors";
import { PromptValidationError, saveTemplate } from "@/lib/prompts/store";

const schema = z.object({
  body: z.string().min(1).max(20000),
  note: z.string().max(300).optional(),
  // Who is editing, e.g. "claude-agent" — recorded on the version.
  by: z.string().min(1).max(60).default("agent"),
});

// PUT /api/admin/prompts/:slug {body, note, by} — agents save a new version
// (x-admin-secret header). Same validation as the /prompts editor.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const template = await saveTemplate(slug, parsed.data.body, `${parsed.data.by} (agent)`, parsed.data.note);
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof PromptValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
