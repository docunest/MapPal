import { NextResponse } from "next/server";
import { listScenarios } from "@/lib/scenarios/store";
import { scenarioErrorResponse } from "@/lib/scenarios/http";

// GET /api/scenarios — scenarios with their active version (prompt + config) and recent versions.
export async function GET() {
  try {
    return NextResponse.json({ scenarios: await listScenarios() });
  } catch (err) {
    return scenarioErrorResponse(err);
  }
}
