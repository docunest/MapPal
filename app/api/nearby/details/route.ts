import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, upstreamError } from "@/lib/http";
import { normalizeLang } from "@/lib/nearby/languages";
import { placeDetails } from "@/lib/nearby/details";
import { activeSources, sourceContext } from "@/lib/sources/runtime";
import { UTILITY_CATEGORIES } from "@/lib/sources/types";

export const maxDuration = 60;

const placeSchema = z.object({
  key: z.string().min(1).max(300),
  mode: z.enum(["utility", "sight"]),
  name: z.string().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: z.string().max(60).optional(),
  category: z.enum(UTILITY_CATEGORIES).optional(),
  wikidata: z.string().regex(/^Q\d+$/).optional(),
  wiki: z.array(z.object({ lang: z.string().regex(/^[a-z-]{2,12}$/), title: z.string().min(1).max(300) })).max(8).default([]),
  refs: z.record(z.string(), z.string().max(300)).default({}),
  userLang: z.string().max(10).default("en"),
  localLangs: z.array(z.string().max(10)).max(3).default([]),
});

// POST /api/nearby/details {place} — everything every source knows about one place.
export async function POST(req: Request) {
  const parsed = placeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid place");
  const place = {
    ...parsed.data,
    userLang: normalizeLang(parsed.data.userLang),
    localLangs: parsed.data.localLangs.map((l) => normalizeLang(l)),
  };
  try {
    const { sources, skipped } = await activeSources("details");
    const result = await placeDetails(place, sources, sourceContext());
    return NextResponse.json({ ...result, notes: [...result.notes, ...skipped] });
  } catch (err) {
    return upstreamError(err);
  }
}
