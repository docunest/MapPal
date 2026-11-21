import { NextResponse } from "next/server";
import { issueToken, listTokens } from "@/lib/agent";

// Agent connector tokens (family login): list, or POST {name} → the token, shown once.
export const GET = async () => NextResponse.json({ tokens: await listTokens() }, { headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { name?: string };
  try {
    return NextResponse.json(await issueToken(String(b.name ?? "")));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
