import { NextResponse } from "next/server";
import { listRules } from "@/lib/agent";

// Every brief layer with its current version (family login): charter, output format, use cases.
export const GET = async () => NextResponse.json({ rules: await listRules() }, { headers: { "Cache-Control": "no-store" } });
