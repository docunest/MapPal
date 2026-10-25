import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { describeDbError } from "@/lib/dbErrors";
import { PromptValidationError, restoreVersion, saveTemplate } from "@/lib/prompts/store";

const saveSchema = z.union([
  z.object({ body: z.string().min(1).max(20000), note: z.string().max(300).optional() }),
  z.object({ restore: z.string().min(1).max(100) }),
]);

// PUT /api/prompts/:slug {body, note} — save a new version (or {restore: versionId}).
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected {body, note} or {restore}" }, { status: 400 });
  const session = await auth();
  const by = session?.user?.name ?? session?.user?.email ?? "someone";
  try {
    const template =
      "restore" in parsed.data
        ? await restoreVersion(slug, parsed.data.restore, by)
        : await saveTemplate(slug, parsed.data.body, by, parsed.data.note);
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof PromptValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
