import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dockCaller } from "@/lib/dock/auth";
import { carPhoto } from "@/lib/dock/photo";
import { sourceContext } from "@/lib/sources/runtime";
import { googleSource } from "@/lib/sources/google";
import { loadSourceSettings, sourceState } from "@/lib/sources/settings";

// GET — one photo of a car place (Wikipedia first, else Google), as the
// image itself. The head unit and the phone keep it 30 days (owner's call,
// 2026-11-07), so it's fetched once per device per place, not on every look.
// No photo: 404, remembered a week. Credit in X-Photo-Credit (URI-encoded).
const KEEP_S = 30 * 24 * 60 * 60;
const MISS_S = 7 * 24 * 60 * 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await dockCaller(req))) return NextResponse.json({ error: "Wrong or missing dock token" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.dockItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const miss = () =>
    new NextResponse(null, { status: 404, headers: { "Cache-Control": `private, max-age=${MISS_S}` } });
  if (item.lat == null || item.lng == null) return miss();

  const googleOn = sourceState(googleSource, await loadSourceSettings()) === "on";
  const photo = await carPhoto({ title: item.title, lat: item.lat, lng: item.lng }, sourceContext(), googleOn);
  if (!photo) return miss();
  return new NextResponse(photo.bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": `private, max-age=${KEEP_S}, immutable`,
      "X-Photo-Source": photo.source,
      "X-Photo-Credit": encodeURIComponent(photo.credit),
      "Access-Control-Expose-Headers": "X-Photo-Source, X-Photo-Credit",
    },
  });
}
