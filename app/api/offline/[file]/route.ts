import { NextResponse } from "next/server";
import { PACK_FILE, PACK_RELEASE } from "@/lib/offline/packs";

// Passes the offline place packs on to the phone (GitHub release downloads send no CORS headers).
// Only the manifest and the web chunks (~2 MB each, under Vercel's response limit). A chunk is
// asked for with ?sha=<sha256 from the manifest>: that makes each version its own cacheable URL,
// and a 409 tells the phone the release moved on (re-read the manifest).
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!PACK_FILE.test(file)) return NextResponse.json({ error: "Unknown file" }, { status: 404 });
  const want = new URL(req.url).searchParams.get("sha");
  const res = await fetch(PACK_RELEASE + file, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Pack source unreachable" }, { status: 502 });
  if (res.status === 404) return NextResponse.json({ error: "Not published yet" }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: `Pack source HTTP ${res.status}` }, { status: 502 });
  const body = await res.arrayBuffer();
  if (file === "poi-manifest.json") {
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=0, s-maxage=600" },
    });
  }
  if (want) {
    const got = Buffer.from(await crypto.subtle.digest("SHA-256", body)).toString("hex");
    if (got !== want) return NextResponse.json({ error: "Pack changed — read the manifest again" }, { status: 409 });
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": want ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}

export const maxDuration = 30;
