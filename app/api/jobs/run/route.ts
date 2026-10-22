import { NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/jobs/runner";

/**
 * Trigger processing of pending ScanJobs. In the MVP this is called
 * on-demand from the UI (a "Scan" button); later this becomes a real
 * worker polling the queue on its own.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const limit = typeof body.limit === "number" ? body.limit : 10;
  const result = await runPendingJobs(limit);
  return NextResponse.json(result);
}
