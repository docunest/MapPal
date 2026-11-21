import { NextResponse } from "next/server";
import { recentBriefs } from "@/lib/agent";

// The latest briefs the agent pulled (family login): use case, page, places, status, layer versions.
export const GET = async () => NextResponse.json({ briefs: await recentBriefs(40) }, { headers: { "Cache-Control": "no-store" } });
