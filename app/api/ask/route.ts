import { NextResponse } from "next/server";
import { z } from "zod";
import { aiEnabled, referenceMaterial, streamAnswer, systemPrompt } from "@/lib/ai";
import { buildDeepDive, parseWikiParam } from "@/lib/live/deepdive";
import { normalizeLang } from "@/lib/live/languages";

export const maxDuration = 120;

const askSchema = z.object({
  target: z.object({
    name: z.string().min(1).max(300),
    qid: z.string().regex(/^Q\d+$/).optional(),
    wiki: z.string().max(1000).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    kind: z.string().max(60).optional(),
    local: z.string().max(10).optional(),
  }),
  mode: z.enum(["kid", "adult"]).default("kid"),
  age: z.number().int().min(3).max(17).default(9),
  lang: z.string().max(10).default("en"),
  // Prior turns of this conversation, oldest first; the last must be the user's.
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
});

// POST /api/ask → text/plain stream. The server rebuilds the reference
// material itself (cached fetches) rather than trusting client-sent context.
export async function POST(req: Request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI answers aren't set up — add ANTHROPIC_API_KEY to the deployment." }, { status: 503 });
  }
  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { target, mode, age, turns } = parsed.data;
  if (turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ error: "The last turn must be a question" }, { status: 400 });
  }
  const lang = normalizeLang(parsed.data.lang);

  const dive = await buildDeepDive({
    name: target.name,
    wikidata: target.qid,
    wiki: parseWikiParam(target.wiki ?? null),
    lat: target.lat,
    lng: target.lng,
    kind: target.kind,
    userLang: lang,
    localLang: target.local ? normalizeLang(target.local) : undefined,
  }).catch(() => null);
  if (!dive) return NextResponse.json({ error: "Couldn't load information about this place" }, { status: 502 });

  const reference = await referenceMaterial(dive, target);
  return new Response(streamAnswer(systemPrompt(mode, age, lang), reference, turns), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
