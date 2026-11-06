// One scenario run at one stop: top-down → bottom-up → validator. Pure
// orchestration — the network (Overpass, AI) and the DB are passed in, so the
// same code runs live, in evidence scripts and in tests on captured data.
import type { AiClient } from "../ai/deepseek";
import type { OverpassElement } from "../overpass";
import { buildBottomUpQuery, candidatesFromElements, frequentNames } from "./bottomUp";
import { topDownPlan } from "./topDown";
import type { PipelineNote, PipelineOutput, ScenarioConfig, TopDownPlan } from "./types";
import { validate, type AiCheck } from "./validate";

export interface PipelineInput {
  scenario: { slug: string; prompt: string; config: ScenarioConfig };
  stop: { lat: number; lng: number; radiusKm: number; country?: string; area?: string };
  langs: string[];
  /** Top-down plan cached for this (scenario version, area); asked fresh when missing. */
  cachedPlan?: TopDownPlan;
  ai: AiClient | null;
  overpass: (query: string) => Promise<OverpassElement[]>;
  cachedChecks?: Map<string, AiCheck>;
  now?: Date;
}

export interface PipelineRun extends PipelineOutput {
  planIsNew: boolean;
  newChecks: Map<string, AiCheck>;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineRun> {
  const now = input.now ?? new Date();
  const notes: PipelineNote[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  // 1. top-down
  let plan = input.cachedPlan;
  const planIsNew = !plan;
  if (!plan) {
    const r = await topDownPlan(input.scenario.prompt, input.scenario.config, { country: input.stop.country, area: input.stop.area, langs: input.langs }, input.ai);
    plan = r.plan;
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;
    notes.push({
      step: "top-down",
      status: r.error ? "failed" : plan.by === "defaults" ? "skipped" : "ok",
      message: `${plan.brands.reduce((n, t) => n + t.brands.length, 0)} brands, ${plan.keywords.length} extra keywords (${plan.by})${plan.note ? ` — ${plan.note}` : ""}`,
    });
  } else {
    notes.push({ step: "top-down", status: "ok", message: `Cached plan for ${input.stop.area ?? "this area"} (${plan.by})` });
  }

  // 2. bottom-up
  const query = buildBottomUpQuery(input.stop, input.stop.radiusKm * 1000, input.scenario.config, plan);
  const elements = await input.overpass(query);
  const candidates = candidatesFromElements(elements, input.scenario.config, plan);
  const frequent = frequentNames(candidates);
  const frequentSet = new Map(frequent.map((f) => [f.name.toLowerCase(), f.count]));
  for (const c of candidates) {
    const n = frequentSet.get((c.tags.brand ?? c.name).toLowerCase());
    if (n) c.matchedBy.push({ by: "frequent-name", name: c.tags.brand ?? c.name, count: n });
  }
  notes.push({
    step: "bottom-up",
    status: candidates.length ? "ok" : "empty",
    message: `${candidates.length} candidates from OpenStreetMap within ${input.stop.radiusKm} km${
      frequent.length ? `; chains not in the brand list: ${frequent.slice(0, 6).map((f) => `${f.name} (${f.count})`).join(", ")}` : ""
    }. Google categories not used (Google is optional; app works without a key).`,
  });

  // 3. validator
  const v = await validate({
    candidates,
    config: input.scenario.config,
    prompt: input.scenario.prompt,
    scenarioSlug: input.scenario.slug,
    center: input.stop,
    now,
    ai: input.ai,
    cachedChecks: input.cachedChecks ?? new Map(),
  });
  notes.push(...v.notes);

  return {
    items: v.items,
    dropped: v.dropped,
    plan,
    planIsNew,
    notes,
    newChecks: v.newChecks,
    aiTokensIn: tokensIn + v.tokensIn,
    aiTokensOut: tokensOut + v.tokensOut,
  };
}
