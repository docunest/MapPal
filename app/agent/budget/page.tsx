import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgentNav } from "@/components/agent/AgentNav";
import { costLog, listRuns, PASS_WEEKLY_PCT, reviewsOf } from "@/lib/agent";

// Budget log: per run, the tokens the server handed the agent, Claude's own
// tokens (from its transcript), and the weekly-allowance % before → after
// (from /usage). No estimates here — only what was measured.
export default function BudgetPage() {
  return (
    <main className="mx-auto max-w-6xl p-4">
      <AgentNav here="/agent/budget" />
      <h1 className="text-xl font-semibold">Budget log</h1>
      <p className="mb-3 text-sm text-neutral-600">Measured numbers only. &ldquo;–&rdquo; = not reported for that run.</p>
      <Suspense fallback={<p>Loading…</p>}>
        <Table />
      </Suspense>
    </main>
  );
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toLocaleString());

async function Table() {
  await connection();
  const runs = (await listRuns(100)).filter((r) => r.status !== "planned");
  const rows = await Promise.all(runs.map(async (r) => ({ run: r, log: costLog(r, await reviewsOf(r.id)) })));
  const measured = rows.filter((x) => x.log.weeklyPct !== null && x.log.claude);
  const perPct = measured.length ? Math.round(measured.reduce((s, x) => s + x.log.claude!.total, 0) / measured.reduce((s, x) => s + x.log.weeklyPct!, 0)) : null;
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const thisWeek = rows.filter((x) => x.run.createdAt >= weekStart);
  return (
    <>
      <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500">This week (since Monday)</div>
          {thisWeek.length} runs · {n(thisWeek.reduce((s, x) => s + (x.log.weeklyPct ?? 0), 0) || null)} % measured
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500">Claude tokens per 1 % of the week</div>
          {perPct ? `${perPct.toLocaleString()} (from ${measured.length} measured run${measured.length > 1 ? "s" : ""})` : "needs a run with both /usage and usage.mjs numbers"}
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500">Target</div>
          one location under {PASS_WEEKLY_PCT} % of the week
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-300 text-neutral-500">
            <tr>
              <th className="p-1">Run (correlation id)</th>
              <th className="p-1">Place</th>
              <th className="p-1">Served to agent</th>
              <th className="p-1">Claude in / out</th>
              <th className="p-1">Claude cache read / write</th>
              <th className="p-1">Week % before → after</th>
              <th className="p-1">Used</th>
              <th className="p-1">Kept</th>
              <th className="p-1">Claude tokens per 1 %</th>
              <th className="p-1">Google</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ run, log }) => (
              <tr key={run.id} className="border-b border-neutral-100">
                <td className="p-1">
                  <Link href={`/agent/runs/${run.id}`} className="font-mono underline">
                    {run.id}
                  </Link>
                  <div className="text-neutral-400">{run.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {run.model ?? ""}</div>
                </td>
                <td className="p-1">{run.plan.zone.campsite.name}</td>
                <td className="p-1">{n(log.tokens)}</td>
                <td className="p-1">{log.claude ? `${n(log.claude.input)} / ${n(log.claude.output)}` : "–"}</td>
                <td className="p-1">{log.claude ? `${n(log.claude.cacheRead)} / ${n(log.claude.cacheWrite)}` : "–"}</td>
                <td className="p-1">{run.usageBeforePct !== null ? `${run.usageBeforePct} → ${run.usageAfterPct ?? "?"}` : "–"}</td>
                <td className={`p-1 font-medium ${log.costPass === false ? "text-red-700" : log.costPass ? "text-green-700" : ""}`}>{log.weeklyPct !== null ? `${log.weeklyPct} %` : "–"}</td>
                <td className="p-1">{log.kept.cafes + log.kept.exploration}</td>
                <td className="p-1">{n(log.claudeTokensPerWeeklyPct)}</td>
                <td className="p-1">{log.googleDetails + log.googlePhotos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
