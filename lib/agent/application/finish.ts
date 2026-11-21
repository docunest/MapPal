// finish_run and the cost log (design doc Phase 0 steps 5 and 7): what the
// run spent, what it kept, and the pass test (< 5 % of the weekly
// allowance, most kept places real and relevant).
import { AGENT_CATEGORIES } from "../domain/types";
import { markTiles, reviewsOf, updateRun, type RunRow } from "../infrastructure/repo";
import { loadRun, RunError } from "./guard";

export const PASS_WEEKLY_PCT = 5;
export const PASS_THUMBS = 0.7;

export interface CostLog {
  status: string;
  cappedBy: string | null;
  tokens: number;
  textTokens: number;
  imageTokens: number;
  pages: number;
  images: number;
  googleDetails: number;
  googlePhotos: number;
  found: Record<string, number>;
  checked: Record<string, number>;
  kept: Record<string, number>;
  real: number;
  reviews: number;
  tokensPerKept: number | null;
  weeklyPct: number | null;
  weeklyPctPerKept: number | null;
  costPass: boolean | null;
  rated: number;
  thumbsUp: number;
  relevancePass: boolean | null;
}

type ReviewRow = Awaited<ReturnType<typeof reviewsOf>>[number];

export function costLog(run: RunRow, reviews: ReviewRow[]): CostLog {
  const c = run.counters;
  const kept = reviews.filter((r) => r.keep);
  const found: Record<string, number> = {};
  const checked: Record<string, number> = {};
  const keptBy: Record<string, number> = {};
  for (const cat of AGENT_CATEGORIES) {
    found[cat] = run.plan.categories[cat].found;
    checked[cat] = c.served[cat];
    keptBy[cat] = kept.filter((r) => r.category === cat).length;
  }
  const weeklyPct = run.usageBeforePct !== null && run.usageAfterPct !== null ? Math.round((run.usageAfterPct - run.usageBeforePct) * 10) / 10 : null;
  const rated = kept.filter((r) => r.ownerRating);
  const up = rated.filter((r) => r.ownerRating === "up").length;
  return {
    status: run.status,
    cappedBy: run.cappedBy,
    tokens: c.tokens,
    textTokens: c.textTokens,
    imageTokens: c.imageTokens,
    pages: c.pages,
    images: c.images,
    googleDetails: c.googleDetails,
    googlePhotos: c.googlePhotos,
    found,
    checked,
    kept: keptBy,
    real: reviews.filter((r) => r.verdict === "real").length,
    reviews: reviews.length,
    tokensPerKept: kept.length ? Math.round(c.tokens / kept.length) : null,
    weeklyPct,
    weeklyPctPerKept: weeklyPct !== null && kept.length ? Math.round((weeklyPct / kept.length) * 100) / 100 : null,
    costPass: weeklyPct === null ? null : weeklyPct < PASS_WEEKLY_PCT,
    rated: rated.length,
    thumbsUp: up,
    relevancePass: rated.length && rated.length >= Math.ceil(kept.length / 2) ? up / rated.length >= PASS_THUMBS : null,
  };
}

export function costText(log: CostLog): string {
  const cats = AGENT_CATEGORIES.map((cat) => `${cat}: ${log.found[cat]} on the map → ${log.checked[cat]} checked → ${log.kept[cat]} kept`).join("; ");
  const lines = [
    `Status: ${log.status}${log.cappedBy ? ` (${log.cappedBy})` : ""}.`,
    `${cats}. ${log.real}/${log.reviews} reviewed places rated real by the agent.`,
    `Served to the agent: ${log.tokens} tokens (text ${log.textTokens}, images ${log.imageTokens}), ${log.pages} pages, ${log.images} images, Google ${log.googleDetails} details + ${log.googlePhotos} photos.`,
    `Per kept place: ${log.tokensPerKept ?? "–"} tokens${log.weeklyPctPerKept !== null ? `, ${log.weeklyPctPerKept} % of the week` : ""}.`,
    log.weeklyPct === null
      ? "Weekly allowance: not measured (pass usage_before_pct and usage_after_pct from /usage)."
      : `Weekly allowance used: ${log.weeklyPct} % → ${log.costPass ? "PASS" : "FAIL"} (limit ${PASS_WEEKLY_PCT} %).`,
    log.relevancePass === null
      ? `Relevance: waiting for the owner's 👍/👎 on the run page (${log.rated} rated so far).`
      : `Relevance: ${log.thumbsUp}/${log.rated} 👍 → ${log.relevancePass ? "PASS" : "FAIL"} (need ${PASS_THUMBS * 100} %).`,
  ];
  return lines.join("\n");
}

const pct = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 100 ? v : null);

export async function finishRun(args: { run_id?: unknown; usage_before_pct?: unknown; usage_after_pct?: unknown; model?: unknown; notes?: unknown }, baseUrl: string) {
  const run = await loadRun(args.run_id);
  if (run.status === "planned") throw new RunError("This run never started (dry run only). Nothing to finish.");
  const before = pct(args.usage_before_pct) ?? run.usageBeforePct;
  const after = pct(args.usage_after_pct) ?? run.usageAfterPct;
  if (before !== null && after !== null && after < before) throw new RunError("usage_after_pct is lower than usage_before_pct — the weekly window may have reset; ask the owner for both numbers again.");
  const reviews = await reviewsOf(run.id);
  // Tile status: indexed when every candidate of the category in that tile was checked and nothing was over the cap.
  const tiles: Parameters<typeof markTiles>[1] = [];
  for (const cat of AGENT_CATEGORIES) {
    const pc = run.plan.categories[cat];
    const byTile = new Map<string, { all: number; checked: number; kept: number }>();
    for (const cand of pc.candidates) {
      const t = byTile.get(cand.tile) ?? { all: 0, checked: 0, kept: 0 };
      t.all++;
      const r = reviews.find((x) => x.candidate === cand.id);
      if (r) t.checked++;
      if (r?.keep) t.kept++;
      byTile.set(cand.tile, t);
    }
    for (const [geohash, t] of byTile) {
      if (!t.checked) continue;
      tiles.push({ geohash, category: cat, status: t.checked === t.all && pc.overCap === 0 ? "indexed" : "partial", checked: t.checked, kept: t.kept });
    }
  }
  await markTiles(run.id, tiles);
  const status = run.status === "capped" ? "capped" : "done";
  const updated: RunRow = {
    ...run,
    status,
    usageBeforePct: before,
    usageAfterPct: after,
    model: typeof args.model === "string" ? args.model.slice(0, 60) : run.model,
    report: typeof args.notes === "string" ? args.notes.slice(0, 4000) : run.report,
    finishedAt: new Date(),
  };
  await updateRun(run.id, { status, usageBeforePct: before, usageAfterPct: after, model: updated.model, report: updated.report, finishedAt: updated.finishedAt });
  const log = costLog(updated, reviews);
  return { text: `${costText(log)}\nRun page: ${baseUrl}/agent/runs/${run.id}`, log };
}

export async function runStatus(runId: unknown, baseUrl: string) {
  const run = await loadRun(runId);
  const log = costLog(run, await reviewsOf(run.id));
  return { text: `${costText(log)}\nRun page: ${baseUrl}/agent/runs/${run.id}`, log };
}
