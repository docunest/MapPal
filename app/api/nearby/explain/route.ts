import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/http";
import { normalizeLang } from "@/lib/nearby/languages";
import { promptVars } from "@/lib/prompts/context";
import { renderPrompt } from "@/lib/prompts/placeholders";
import { getTemplate } from "@/lib/prompts/store";
import { activeSources, sourceContext } from "@/lib/sources/runtime";
import { SourceCappedError } from "@/lib/sources/types";
import { wikidataSource } from "@/lib/sources/wikidata";
import { wikipediaSource } from "@/lib/sources/wikipedia";

export const maxDuration = 60;

const schema = z.object({
  template: z.string().regex(/^[a-z0-9-]{1,60}$/),
  place: z.object({
    key: z.string().min(1).max(300),
    mode: z.enum(["utility", "sight"]),
    name: z.string().min(1).max(300),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    kind: z.string().max(60).optional(),
    wikidata: z.string().regex(/^Q\d+$/).optional(),
    wiki: z.array(z.object({ lang: z.string().regex(/^[a-z-]{2,12}$/), title: z.string().min(1).max(300) })).max(8).default([]),
    refs: z.record(z.string(), z.string().max(300)).default({}),
    userLang: z.string().max(10).default("en"),
    localLangs: z.array(z.string().max(10)).max(3).default([]),
  }),
});

// POST /api/nearby/explain {template, place} → AI text from a shared template.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request");
  const place = {
    ...parsed.data.place,
    userLang: normalizeLang(parsed.data.place.userLang),
    localLangs: parsed.data.place.localLangs.map((l) => normalizeLang(l)),
  };

  const [{ sources }, template] = await Promise.all([activeSources("explain"), getTemplate(parsed.data.template)]);
  if (!sources.length) return NextResponse.json({ error: "No AI source is switched on." }, { status: 503 });
  if (!template) return NextResponse.json({ error: `No prompt template "${parsed.data.template}"` }, { status: 404 });

  const ctx = sourceContext();
  try {
    // The public text comes from the same free sources the details screen shows.
    const prompt = renderPrompt(template.body, await promptVars(place, [wikipediaSource, wikidataSource], ctx));
    const ai = sources[0];
    const out = await ai.explain!({ prompt, templateSlug: template.slug }, ctx);
    return NextResponse.json({ ...out, source: ai.meta.id, template: template.slug });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: err instanceof SourceCappedError ? 429 : 502 });
  }
}
