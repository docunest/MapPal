import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminRequest } from "../adminAuth";
import { describeDbError } from "../dbErrors";
import { ScenarioError } from "./store";

/**
 * Who is making a change: the logged-in family member, or "agent" with the
 * admin secret (only reachable once a route is opened in proxy.ts — none are yet).
 */
export async function caller(req: Request): Promise<string> {
  if (isAdminRequest(req)) return "agent";
  const session = await auth();
  return session?.user?.name ?? session?.user?.email ?? "someone";
}

export function scenarioErrorResponse(err: unknown) {
  if (err instanceof ScenarioError) return NextResponse.json({ error: err.message }, { status: err.status });
  return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
}
