// Manual run: the same briefs as get_briefs, as one text to paste into any
// chat agent (ChatGPT, Claude.ai, Gemini…), and the agent's JSON answer
// pasted back. The person pressing the button is the owner's yes.
import { textTokens } from "../domain/caps";
import { briefsOfRun, getBrief } from "../infrastructure/briefs";
import { logEvent } from "../infrastructure/events";
import { type BriefArgs, previewBriefs, pullBriefs, submitResults } from "./briefs";
import { discoverPrompt, discoveriesIn, submitDiscoveries, type DiscoverArgs } from "./discover";
import { finishRun } from "./finish";
import { loadRun, RunError } from "./guard";

const who = (by: string) => `manual:${by.trim().slice(0, 30) || "app"}`;

export async function manualPreview(args: BriefArgs, mode: "judge" | "discover" = "judge", discover: Pick<DiscoverArgs, "count" | "radius_km"> = {}) {
  if (mode === "discover") return discoverPrompt({ ...args, ...discover }, "manual", "", { preview: true, manual: true });
  return previewBriefs(args);
}

/** Discover mode as a manual run: the prompt to paste; the answer comes back through manualImport. */
export async function manualDiscover(args: DiscoverArgs, by: string, baseUrl: string) {
  const r = await discoverPrompt({ ...args, owner_approved: true }, who(by), baseUrl, { manual: true });
  await logEvent(r.runId, { kind: "manual.payload", summary: `manual discover prompt built for ${by || "app"}: ${r.useCases.join(", ")}, ~${r.tokens.toLocaleString()} tokens`, data: { useCases: r.useCases, chars: r.text.length } });
  return { runId: r.runId, briefIds: r.useCases, text: r.text, tokens: r.tokens, chars: r.text.length, mode: "discover" as const };
}

export async function manualPayload(args: BriefArgs, by: string, baseUrl: string) {
  const r = await pullBriefs({ ...args, owner_approved: true }, who(by), baseUrl, { manual: true });
  await logEvent(r.runId, { kind: "manual.payload", summary: `manual payload built for ${by || "app"}: ${r.briefIds.length} briefs, ~${textTokens(r.text).toLocaleString()} tokens of text`, data: { briefs: r.briefIds, chars: r.text.length } });
  return { runId: r.runId, briefIds: r.briefIds, text: r.text, tokens: textTokens(r.text), chars: r.text.length };
}

/** Every object with a "candidate" in whatever shape the agent answered: {briefs:{id:[…]}}, {id:[…]}, [{brief_id, results}], a bare list… */
export function resultsIn(json: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.candidate === "string") return void out.push(o);
    Object.values(o).forEach(walk);
  };
  walk(json);
  return out;
}

/** The JSON inside a chat reply: code fences, a sentence before or after, smart quotes from a phone keyboard. */
export function parseReply(text: string): unknown {
  const t = text.replace(/^﻿/, "").replace(/```(?:json)?/gi, "").trim();
  const tries = [t];
  const first = t.search(/[[{]/);
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (first >= 0 && last > first) tries.push(t.slice(first, last + 1));
  for (const s of [...tries, ...tries.map((x) => x.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"))]) {
    try {
      return JSON.parse(s);
    } catch {
      // next shape
    }
  }
  throw new RunError("Couldn't find JSON in the pasted text. Paste the agent's whole answer (the {…} object).");
}

/** Save a pasted answer: results go to the brief that sent each place; then the run is finished. */
export async function manualImport(input: { text?: unknown; run_id?: unknown; by?: unknown; model?: unknown }, baseUrl: string) {
  if (typeof input.text !== "string" || !input.text.trim()) throw new RunError("Paste the agent's answer first.");
  const json = parseReply(input.text);
  const results = resultsIn(json);
  if (!results.length) throw new RunError('No results found — each place needs a "candidate" id like "c3".');
  // Which pull: the run_id in the answer, the one this screen built, or the run of a brief id the answer names.
  let runId = typeof (json as { run_id?: unknown })?.run_id === "string" ? String((json as { run_id: string }).run_id) : typeof input.run_id === "string" ? input.run_id : "";
  if (!runId) {
    const ids = JSON.stringify(json).match(/brf_\d{8}_[0-9a-f]{8}/);
    if (ids) runId = (await getBrief(ids[0]))?.runId ?? "";
  }
  if (!runId) throw new RunError("Which pull is this? The answer has no run_id — build the payload here first, or paste an answer that includes it.");
  const by0 = typeof input.by === "string" ? input.by : "app";
  const model0 = typeof input.model === "string" && input.model.trim() ? input.model.trim().slice(0, 40) : "";
  const run = await loadRun(runId);
  if (run.plan.mode === "discover") return importDiscoveries(run.id, Object.keys(run.plan.discover ?? {}), json, by0, model0, baseUrl);
  const briefs = await briefsOfRun(runId);
  if (!briefs.length) throw new RunError(`No briefs in ${runId}.`);
  const briefOf = new Map<string, string>();
  for (const b of briefs) for (const c of b.candidates as Array<{ id: string }>) briefOf.set(c.id, b.id);
  const by = typeof input.by === "string" ? input.by : "app";
  const agent = `${who(by)}${typeof input.model === "string" && input.model.trim() ? ` (${input.model.trim().slice(0, 40)})` : ""}`;

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const id = String(r.candidate);
    if (seen.has(id)) continue; // the same place twice: first answer wins
    seen.add(id);
    const b = briefOf.get(id);
    if (!b) unknown.push(id);
    else grouped.set(b, [...(grouped.get(b) ?? []), r]);
  }
  const lines: string[] = [];
  let saved = 0;
  for (const [briefId, list] of grouped) {
    for (let i = 0; i < list.length; i += 20) {
      try {
        await submitResults(briefId, list.slice(i, i + 20), agent);
        saved += list.slice(i, i + 20).length;
      } catch (e) {
        lines.push(`${briefId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (unknown.length) lines.push(`Not in this pull (skipped): ${unknown.join(", ")}`);
  const sent = briefs.reduce((s, b) => s + (b.candidates as unknown[]).length, 0);
  if (saved) await finishRun({ run_id: runId, model: typeof input.model === "string" && input.model.trim() ? `manual: ${input.model.trim().slice(0, 40)}` : "manual", notes: `Pasted by ${by}: ${saved} of ${sent} places judged.${lines.length ? ` Problems: ${lines.join(" | ")}` : ""}` }, baseUrl).catch((e) => lines.push(`finish: ${e instanceof Error ? e.message : String(e)}`));
  await logEvent(runId, { kind: "manual.import", summary: `manual answer pasted by ${by}: ${saved} of ${sent} saved${lines.length ? `, ${lines.length} problem(s)` : ""}`, data: { saved, sent, problems: lines } });
  return { runId, saved, sent, problems: lines, report: [] as string[], page: `${baseUrl}/agent/runs/${runId}` };
}

async function importDiscoveries(runId: string, useCases: string[], json: unknown, by: string, model: string, baseUrl: string) {
  const found = discoveriesIn(json, useCases);
  if (!found.size) throw new RunError('No places found — each needs "name", "lat" and "lng", under its use case ("discoveries": {"cafes": [ … ]}).');
  const agent = `${who(by)}${model ? ` (${model})` : ""}`;
  const lines: string[] = [];
  const report: string[] = [];
  let saved = 0;
  let sent = 0;
  for (const [uc, list] of found) {
    sent += list.length;
    for (let i = 0; i < list.length; i += 30) {
      try {
        const r = await submitDiscoveries(runId, uc, list.slice(i, i + 30), agent);
        saved += r.saved;
        report.push(r.text);
      } catch (e) {
        lines.push(`${uc}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (saved) await finishRun({ run_id: runId, model: model ? `manual: ${model}` : "manual", notes: `Discover answer pasted by ${by}: ${saved} of ${sent} places saved.` }, baseUrl).catch((e) => lines.push(`finish: ${e instanceof Error ? e.message : String(e)}`));
  await logEvent(runId, { kind: "manual.import", summary: `manual discover answer pasted by ${by}: ${saved} of ${sent} saved`, data: { saved, sent } });
  return { runId, saved, sent, problems: lines, report, page: `${baseUrl}/agent/runs/${runId}` };
}
