import { NextResponse } from "next/server";
import { baseUrlOf, manualImport, RunError } from "@/lib/agent";

// Manual run, step 2 (family login): POST {text, run_id?, by, model?} — the agent's pasted answer → saved reviews.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return NextResponse.json(await manualImport(b, baseUrlOf(req)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof RunError ? 400 : 500 });
  }
}
