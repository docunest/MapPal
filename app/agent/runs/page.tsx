import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { costLog, listRuns, reviewsOf } from "@/lib/agent";

// Agent cost-test runs (docs/PLAN.md → "Hybrid agent backend — Phase 0"), newest first.
export default function AgentRunsPage() {
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
      <Runs />
    </Suspense>
  );
}

async function Runs() {
  await connection();
  const runs = await listRuns();
  const rows = await Promise.all(runs.map(async (r) => ({ run: r, log: costLog(r, await reviewsOf(r.id)) })));
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-semibold">Agent runs</h1>
      <p className="mt-1 text-sm text-neutral-600">Cost tests: cafes and exploration around the latest known location. Verdicts are AI.</p>
      {!rows.length && <p className="mt-4 text-sm">No runs yet. Connect Claude Code to the agent connector and ask it to run the cost test.</p>}
      <ul className="mt-4 space-y-2">
        {rows.map(({ run, log }) => (
          <li key={run.id} className="rounded border border-neutral-200 p-3">
            <Link href={`/agent/runs/${run.id}`} className="font-medium underline">
              {run.plan.zone.campsite.name} · {run.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </Link>
            <div className="text-sm text-neutral-600">
              {run.status}
              {run.cappedBy ? ` (${run.cappedBy})` : ""} · {log.tokens.toLocaleString()} tokens · kept {log.kept.cafes} cafes, {log.kept.exploration} spots
              {log.weeklyPct !== null ? ` · ${log.weeklyPct} % of the week ${log.costPass ? "✅" : "❌"}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
