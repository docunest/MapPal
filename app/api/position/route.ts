import { NextResponse } from "next/server";
import { getTravelState } from "@/lib/agent";
import { homeOf, isPositionToken, positionTokenFrom } from "@/lib/position";
import { describeDbError } from "@/lib/dbErrors";

// GET /api/position (Authorization: Bearer <POSITION_TOKEN>) — where the family
// is now, for devices with no GPS chip (the kid tablet's mock location).
// {home: {lat, lng, accuracyM, source, label, at} | null}
export async function GET(req: Request) {
  if (!isPositionToken(positionTokenFrom(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  try {
    return NextResponse.json({ home: homeOf(await getTravelState()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
