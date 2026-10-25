import { NextResponse } from "next/server";
import { z } from "zod";
import { aiEnabled, describeAiError, identifyPhoto } from "@/lib/ai";
import { normalizeLang } from "@/lib/live/languages";

export const maxDuration = 120;

const identifySchema = z.object({
  // Client downsizes to ~1024 px JPEG first; this caps abuse, not real photos.
  image: z.string().min(100).max(4_000_000),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  candidates: z
    .array(
      z.object({
        name: z.string().max(300),
        kindLabel: z.string().max(80),
        distance: z.number(),
        compass: z.string().max(4),
        direction: z.string().max(10).optional(),
      }),
    )
    .max(30)
    .default([]),
  mode: z.enum(["kid", "adult"]).default("kid"),
  age: z.number().int().min(3).max(17).default(9),
  lang: z.string().max(10).default("en"),
});

// POST /api/identify — "what's that?" from a photo, matched against what
// Lens already knows is nearby.
export async function POST(req: Request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "Photo lens isn't set up — add ANTHROPIC_API_KEY to the deployment." }, { status: 503 });
  }
  const parsed = identifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { image, ...rest } = parsed.data;
  try {
    const result = await identifyPhoto({ ...rest, imageBase64: image, lang: normalizeLang(rest.lang) });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: describeAiError(err) }, { status: 502 });
  }
}
