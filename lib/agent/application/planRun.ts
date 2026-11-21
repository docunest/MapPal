// plan_run = the dry run (design doc Phase 0 step 6). Free work only: the
// location estimate, the place index (OpenStreetMap cells fetched once and
// kept), the run cache. Every step is logged under the run's id.
import { randomBytes } from "node:crypto";
import { localLangsAt } from "@/lib/nearby/region";
import { capsFromEnv } from "../domain/caps";
import { buildPlan, planText } from "../domain/plan";
import { emptyCounters, type OsmThing, type Zone } from "../domain/types";
import { travelState } from "../domain/travelState";
import { EXPLORE_RADIUS_M, pickZone } from "../domain/zone";
import { googleConfigured } from "../infrastructure/enrich";
import { logEvent } from "../infrastructure/events";
import { indexArea, placesNear } from "../infrastructure/osmIndex";
import { createRun, freshlyReviewed } from "../infrastructure/repo";
import { loadFixes } from "../infrastructure/travelSources";

export interface PlanInput {
  lat?: number;
  lng?: number;
  label?: string;
}

// The circle the dry run needs from the index: the exploration radius plus a margin for the towns.
const NEED_KM = EXPLORE_RADIUS_M / 1000 + 1;

export async function planRun(agent: string, input: PlanInput) {
  // The run id is made first so every event of the dry run carries it.
  const runId = `run_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  let target: Zone["target"];
  const fixes = await loadFixes();
  const state = travelState(fixes);
  await logEvent(runId, {
    kind: "location.hints",
    summary: `${state.hints.length} position hints, ${state.destinations.length} destinations`,
    data: {
      hints: state.hints.slice(0, 60).map((h) => ({ label: h.label, source: h.source, lat: h.lat, lng: h.lng, at: h.at, ageH: Math.round(h.ageH * 10) / 10, weight: Math.round(h.weight * 100) / 100, used: h.used, note: h.note })),
      destinations: state.destinations.slice(0, 20).map((d) => ({ label: d.label, source: d.source, lat: d.lat, lng: d.lng, at: d.at, arriveOn: d.arriveOn })),
    },
  });
  if (state.estimate) {
    const e = state.estimate;
    await logEvent(runId, { kind: "location.estimate", summary: `best guess ${e.label} ±${e.accuracyKm} km, confidence ${Math.round(e.confidence * 100)} %`, data: e, lat: e.lat, lng: e.lng });
  }
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    target = { lat: input.lat, lng: input.lng, label: input.label?.slice(0, 80) || `${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}`, source: "given by the agent" };
  } else {
    if (!state.target) throw new Error("No location known from any source. Share a location from the phone to the car, pin it (set_location), or pass lat/lng.");
    target = { lat: state.target.lat, lng: state.target.lng, label: state.target.label, source: state.target.source, at: state.target.at.toISOString() };
  }
  await logEvent(runId, { kind: "target", summary: `run target: ${target.label} (${target.source})`, data: { target, why: input.lat !== undefined ? "given by the agent" : state.why }, lat: target.lat, lng: target.lng });

  // The index first: fetch any missing or stale cell around the target (≤ ~80 s), then read the database.
  const progress = await indexArea(target, NEED_KM, runId, 80_000);
  const placePromise = localLangsAt(target);
  const zone = pickZone(target, await placesNear({ ...target, radiusM: 14_000 }, ["stay", "town"]));
  await logEvent(runId, { kind: "zone", summary: zone.why, data: { campsite: zone.campsite, towns: zone.towns, cafeCircles: zone.cafeCircles, explore: zone.explore }, lat: zone.campsite.lat, lng: zone.campsite.lng });

  const food = new Map<string, OsmThing>();
  for (const c of zone.cafeCircles) for (const t of await placesNear(c, ["food"])) food.set(t.ref, t);
  const explore = await placesNear(zone.explore, ["explore", "parking"]);
  const gaps = [...progress.failed.map((f) => f.cell), ...progress.missing];
  const gapNote = gaps.length ? `${gaps.length} of ${progress.cells} index cells around here are missing (${gaps.join(", ")}): places there aren't in this plan` : undefined;
  const caps = capsFromEnv();
  const cached = await freshlyReviewed([...food.keys(), ...explore.map((t) => t.ref)]);
  const place = await placePromise;
  const plan = buildPlan(
    zone,
    { cafes: { things: [...food.values()], failed: gapNote && !food.size ? gapNote : undefined }, exploration: { things: explore, failed: gapNote && !explore.length ? gapNote : undefined } },
    cached,
    caps,
    googleConfigured(),
    { country: place.country, lang: place.country?.toUpperCase() === "PT" ? "pt" : "es" },
  );
  plan.notes.unshift(`Place index: ${progress.fresh.length} cells already stored, ${progress.fetched.length} fetched now${progress.failed.length ? `, ${progress.failed.length} failed` : ""}${progress.missing.length ? `, ${progress.missing.length} not fetched yet (out of time — run index_area, then plan again)` : ""}.`);
  if (gapNote && (food.size || explore.length)) plan.notes.push(gapNote);
  if (input.lat === undefined) plan.notes.unshift(`Location: ${state.why}`);
  for (const [cat, pc] of Object.entries(plan.categories)) {
    await logEvent(runId, {
      kind: "rules",
      summary: `${cat}: ${pc.found} in the index → ${pc.dropped.length} dropped, ${pc.cached.length} cached, ${pc.candidates.length} to check, ${pc.overCap} over the cap`,
      data: { category: cat, found: pc.found, dropped: pc.dropped, cached: pc.cached, candidates: pc.candidates.map((c) => ({ id: c.id, name: c.name, osmRef: c.osmRef, lat: c.lat, lng: c.lng, score: c.score, why: c.why })) },
    });
  }
  const run = await createRun(agent, plan, caps, emptyCounters(), runId);
  await logEvent(runId, { kind: "plan", summary: `dry run: ${plan.estimate.text}`, data: { estimate: plan.estimate, caps } });
  return { run, text: planText(run.id, plan, caps) };
}
