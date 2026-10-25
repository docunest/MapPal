import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeLang } from "@/lib/nearby/languages";
import { promptVars } from "@/lib/prompts/context";
import { renderPrompt, unknownPlaceholders } from "@/lib/prompts/placeholders";
import { sourceContext } from "@/lib/sources/runtime";
import { wikidataSource } from "@/lib/sources/wikidata";
import { wikipediaSource } from "@/lib/sources/wikipedia";

export const maxDuration = 60;

// A real Iberian place to preview against when the editor has none yet.
const SAMPLE = {
  key: "Q1547306",
  mode: "sight" as const,
  name: "Leixões Port",
  lat: 41.1833,
  lng: -8.7,
  kind: "port",
  wikidata: "Q1547306",
  wiki: [
    { lang: "en", title: "Port of Leixões" },
    { lang: "pt", title: "Porto de Leixões" },
  ],
  refs: {},
  userLang: "en",
  localLangs: ["pt"],
};

const schema = z.object({
  body: z.string().min(1).max(20000),
  place: z
    .object({
      key: z.string().min(1).max(300),
      mode: z.enum(["utility", "sight"]),
      name: z.string().min(1).max(300),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      kind: z.string().max(60).optional(),
      wikidata: z.string().regex(/^Q\d+$/).optional(),
      wiki: z.array(z.object({ lang: z.string(), title: z.string() })).max(8).default([]),
      refs: z.record(z.string(), z.string()).default({}),
      userLang: z.string().max(10).default("en"),
      localLangs: z.array(z.string().max(10)).max(3).default([]),
    })
    .optional(),
});

// POST /api/prompts/preview {body, place?} → exactly the text the AI would receive.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected {body, place?}" }, { status: 400 });
  const bad = unknownPlaceholders(parsed.data.body);
  if (bad.length) {
    return NextResponse.json({ error: `Unknown placeholder(s): ${bad.map((b) => `{{${b}}}`).join(", ")}` }, { status: 400 });
  }
  const p = parsed.data.place ?? SAMPLE;
  const place = { ...p, userLang: normalizeLang(p.userLang), localLangs: p.localLangs.map((l) => normalizeLang(l)) };
  const vars = await promptVars(place, [wikipediaSource, wikidataSource], sourceContext());
  return NextResponse.json({ prompt: renderPrompt(parsed.data.body, vars), place: { name: place.name } });
}
