import { NextResponse, type NextRequest } from "next/server";
import { badRequest, numParam, upstreamError } from "@/lib/http";
import { buildDeepDive, parseWikiParam } from "@/lib/live/deepdive";
import { normalizeLang } from "@/lib/live/languages";

export const maxDuration = 60;

// GET /api/deepdive?name=..&qid=Q..&wiki=lang:Title|..&lat=..&lng=..&kind=..&lang=en&local=cs
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const name = params.get("name")?.trim();
  if (!name) return badRequest("name is required");
  const qid = params.get("qid") ?? undefined;
  if (qid && !/^Q\d+$/.test(qid)) return badRequest("qid must look like Q12345");

  try {
    const dive = await buildDeepDive({
      name,
      wikidata: qid,
      wiki: parseWikiParam(params.get("wiki")),
      lat: numParam(params, "lat"),
      lng: numParam(params, "lng"),
      kind: params.get("kind") ?? undefined,
      userLang: normalizeLang(params.get("lang")),
      localLang: params.get("local") ? normalizeLang(params.get("local")) : undefined,
    });
    return NextResponse.json({ ...dive, aiAvailable: !!process.env.ANTHROPIC_API_KEY });
  } catch (err) {
    return upstreamError(err);
  }
}
