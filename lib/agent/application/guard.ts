// Loading a run for an agent call, with the state rules in one place.
import { CAP_LABEL, type CapName } from "../domain/caps";
import type { Counters } from "../domain/types";
import { logEvent } from "../infrastructure/events";
import { getRun, updateRun, type RunRow } from "../infrastructure/repo";

export class RunError extends Error {}

export async function loadRun(id: unknown): Promise<RunRow> {
  if (typeof id !== "string" || !id) throw new RunError("run_id is required (from plan_run).");
  const run = await getRun(id);
  if (!run) throw new RunError(`No run ${id}.`);
  return run;
}

/** Spending calls need a started, uncapped run. */
export function assertSpending(run: RunRow) {
  if (run.status === "planned") throw new RunError("This run never started.");
  if (run.status === "capped") throw new RunError(`CAP HIT earlier (${run.cappedBy}). Stop: submit reviews for what you have seen, then call finish_run.`);
  if (run.status !== "running") throw new RunError(`Run is ${run.status}; nothing more can be spent on it.`);
}

export const spentLine = (c: Counters, caps: RunRow["caps"]) =>
  `Spent so far: ${c.tokens}/${caps.tokens} tokens (text ${c.textTokens}, images ${c.imageTokens}) · pages ${c.pages}/${caps.pages} · images ${c.images}/${caps.images} · Google details ${c.googleDetails}/${caps.googleDetails}, photos ${c.googlePhotos}/${caps.googlePhotos} · places ${Object.values(c.served).reduce((s, n) => s + n, 0)}/${caps.places} (${Object.entries(c.served).map(([k, n]) => `${k} ${n}`).join(", ")}).`;

/** Stop the run at a cap — it never quietly carries on (design doc Phase 0 step 2). */
export async function capRun(run: RunRow, cap: CapName, counters: Counters): Promise<string> {
  const reason = `${CAP_LABEL[cap]} cap reached`;
  await updateRun(run.id, { status: "capped", cappedBy: reason, counters });
  await logEvent(run.id, { kind: "cap", summary: `CAP HIT: ${reason}`, data: { cap, counters } });
  return `CAP HIT: ${reason}. Stop now. Submit reviews for every place you've seen (submit_reviews), then call finish_run and report to the owner.`;
}
