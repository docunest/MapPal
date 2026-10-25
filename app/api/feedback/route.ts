import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { myVotes, recordFeedback } from "@/lib/feedback";

async function userEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

// GET /api/feedback?places=key1,key2 — my votes on these places and their sources.
export async function GET(req: NextRequest) {
  const email = await userEmail();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const keys = (req.nextUrl.searchParams.get("places") ?? "").split(",").filter(Boolean).slice(0, 50);
  try {
    return NextResponse.json({ votes: await myVotes(email, keys) });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}

const voteSchema = z.object({
  targetType: z.enum(["place", "source"]),
  targetKey: z.string().min(1).max(300),
  placeKey: z.string().max(300).optional(),
  placeKind: z.string().max(60).optional(),
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  // For 👍 on a place: what to put on the family list.
  place: z
    .object({
      name: z.string().min(1).max(300),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      kind: z.string().min(1).max(60),
      wikidata: z.string().regex(/^Q\d+$/).optional(),
      imageUrl: z.string().url().max(1000).optional(),
    })
    .optional(),
});

// POST /api/feedback — 👍/👎 on a source, 👍 on a place (also saves it to the family list).
export async function POST(req: Request) {
  const email = await userEmail();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = voteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { place, ...vote } = parsed.data;
  if (vote.targetType === "place" && vote.value === -1) {
    return NextResponse.json({ error: "Places only take 👍" }, { status: 400 });
  }
  try {
    await recordFeedback(email, vote);
    if (vote.targetType === "place" && vote.value === 1 && place) {
      const session = await auth();
      await prisma.savedSpot.upsert({
        where: { sourceKey: vote.targetKey },
        create: { sourceKey: vote.targetKey, ...place, savedBy: session?.user?.name ?? email },
        update: { status: "MUST_VISIT" },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
