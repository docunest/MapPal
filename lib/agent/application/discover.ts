// Discover mode: instead of judging a list the server picked, the agent names
// the top places itself (rules, the family's likes and blacklist, the known
// places as a negative list). Every answer is cross-checked against the
// OpenStreetMap index: matched places get their map element, the rest are
// kept as "not on the map" with the link the agent checked (Google Maps,
// Instagram, a website) for the family to verify.
import { capsFromEnv, textTokens } from "../domain/caps";
import { hintsLayer, knownLayer, locationLayer, usecaseLayer } from "../domain/brief";
import { DISCOVER_LINE, DISCOVER_RULES, discoveriesSchema, extRef, matchToIndex, type DiscoveryInput } from "../domain/discover";
import { geohash } from "../domain/geohash";
import type { ReviewInput } from "../domain/review";
import { emptyCounters, type Candidate, type Plan } from "../domain/types";
import { distanceMeters } from "@/lib/geo";
import { voteHints } from "../infrastructure/briefs";
import { logEvent } from "../infrastructure/events";
import { placesNear } from "../infrastructure/osmIndex";
import { createRun, reviewsOf, savePayload, saveReviews, updateRun } from "../infrastructure/repo";
import { newId, prepare, type BriefArgs } from "./briefs";
import { loadRun, RunError } from "./guard";

export interface DiscoverArgs extends BriefArgs {
  /** Places to ask for per use case (default 25, ≤ 30). */
  count?: number;
  /** How far from the target (default: the use case's own radius, or 10 km for town-based ones). */
  radius_km?: number;
  owner_approved?: unknown;
}

/** Build the discover prompt (one per pull, every use case in it) and open the run its answers go to. */
export async function discoverPrompt(args: DiscoverArgs, agent: string, baseUrl: string, opts: { manual?: boolean; preview?: boolean } = {}) {
  if (!opts.preview && args.owner_approved !== true) throw new RunError("owner_approved must be true — show the owner what you'll search for first.");
  const manual = opts.manual === true;
  const runId = newId(opts.preview ? "prev" : "run");
  const p = await prepare(args, runId, 15_000);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }); // YYYY-MM-DD where they are
  const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const target = p.zone.target;
  const loc = locationLayer(p.zone, p.estimateLine);
  const categories: Plan["categories"] = {};
  const discover: NonNullable<Plan["discover"]> = {};
  const sections: string[] = [];
  for (const u of p.useCases) {
    const count = Math.min(30, Math.max(1, Math.round(args.count ?? u.profile.pageSize)));
    const radiusKm = Math.min(150, Math.max(1, args.radius_km ?? (u.profile.area.kind === "radius" ? u.profile.area.km : 10)));
    const mustDoKm = Math.max(radiusKm, u.profile.mustDoKm ?? radiusKm);
    const window = u.profile.windowDays ? { from: today, to: plusDays(today, u.profile.windowDays) } : null;
    const title = p.titles[u.profile.useCase] ?? u.profile.title;
    categories[u.profile.useCase] = { found: u.found, dropped: [], cached: [...u.known.values()].map((k) => k.name).slice(0, 300), candidates: [], overCap: 0 };
    discover[u.profile.useCase] = { count, radiusKm, center: { lat: target.lat, lng: target.lng, label: target.label }, layers: u.profile.layers, known: [...u.known.keys()].slice(0, 2000), family: u.family[0], mustDoKm, window };
    const known = knownLayer([...u.known].map(([osmRef, k]) => ({ osmRef, name: k.name })));
    const hints = hintsLayer(await voteHints(u.family, p.titles), title, p.titles[u.family[0]] ?? u.family[0]);
    const rules = usecaseLayer(u.profile, u.chain.map((c) => ({ title: c.title, body: c.body, version: c.version, hash: c.hash })), { found: u.found, dropped: {} });
    sections.push(`# Find: ${title} — up to ${count} within ${radiusKm} km of ${target.label} (${target.lat.toFixed(4)}, ${target.lng.toFixed(4)})${mustDoKm > radiusKm ? `, must-dos up to ${mustDoKm} km` : ""}${window ? `, dates ${window.from} to ${window.to}` : ""}
use_case: "${u.profile.useCase}"

${rules}

${known.text}

${hints.text}

## 7. Your task
Name up to ${count} ${title} ${u.profile.useCase.includes("event") ? "events" : "places"} within ${radiusKm} km (one way, by road) of ${target.label}${mustDoKm > radiusKm ? `; something really special may be up to ${mustDoKm} km — then fill must_do_reason` : ""}. Judge each by layers 4 and 6; don't rank them, the family filters in the app.${window ? `\nToday is ${today}. Search window: ${window.from} to ${window.to} (the family stays a different number of days at each stop and plans up to ${u.profile.windowDays} days ahead). Only things that run on dates inside this window; check the season, not just the opening hours.` : ""}${u.profile.select.length ? ` For reference, OpenStreetMap has ${u.found} such places in this area — you may name ones it lacks.` : ""}`);
  }
  if (!sections.length) throw new RunError("No use case to search for here.");
  const plan: Plan = {
    zone: p.zone,
    categories,
    estimate: { servedTokens: 0, pages: 0, images: 0, googleDetails: 0, googlePhotos: 0, agentTurns: 0, outputTokens: 0, cachedRereadTokens: 0, text: "measured, see the cost log" },
    google: false,
    lang: "pt",
    notes: [p.indexNote, `Discover: the agent names the places; the server cross-checks OpenStreetMap.`],
    mode: "discover",
    discover,
  };
  const head = `# MapPal discover — ${opts.preview ? "preview (nothing opened)" : `pull ${runId}`}
${manual ? "Manual run: you have no MapPal tools here — answer at the very end with ONE JSON object (see \"How to answer\")." : "Answer each use case with submit_discoveries(run_id, use_case, places)."}${opts.preview ? "" : ` Pull page: ${baseUrl}/agent/runs/${runId}`}

## 1. Charter (v${p.charter.version} · ${p.charter.hash})
${p.charter.body}

## 2. How to find and what to return
${DISCOVER_RULES}
${DISCOVER_LINE}

## 3. Location (· ${loc.hash})
${loc.text}`;
  const useCases = Object.keys(categories);
  const footer = manual
    ? `\n\n---\n## How to answer (manual run ${runId})\nReply with ONE JSON object and nothing else — the family pastes it back into MapPal:\n{"run_id": "${runId}", "discoveries": {${useCases.map((u) => `"${u}": [ … ]`).join(", ")}}}\nEach list holds your places for that use case in the format of layer 2.`
    : `\n\n---\nUse cases: ${useCases.join(", ")}. Next: submit_discoveries(run_id="${runId}", use_case, places) for each (≤ 30 per call), then finish_run(run_id="${runId}") with the owner's /usage numbers and usage.mjs.`;
  const text = `${head}\n\n${sections.join("\n\n")}${footer}`;
  if (opts.preview) return { runId, text, useCases, tokens: textTokens(text) };
  const counters = emptyCounters();
  counters.tokens = counters.textTokens = textTokens(text);
  await createRun(agent, plan, capsFromEnv(), counters, runId);
  await updateRun(runId, { status: "running", approvedAt: new Date() });
  await savePayload(runId, text);
  await logEvent(runId, { kind: "discover.prompt", summary: `discover prompt for ${useCases.join(", ")} around ${target.label}: ~${counters.tokens} tokens${manual ? " (manual)" : ""}`, data: { discover, manual }, tokens: counters.tokens, lat: target.lat, lng: target.lng });
  return { runId, text, useCases, tokens: counters.tokens };
}

/** Save what the agent found for one use case, each place cross-checked against OpenStreetMap. */
export async function submitDiscoveries(runId: unknown, useCase: unknown, places: unknown, agent: string) {
  const run = await loadRun(runId);
  if (run.plan.mode !== "discover" || !run.plan.discover) throw new RunError(`${run.id} isn't a discover pull — use submit_results for briefs.`);
  if (run.status === "planned" || run.status === "cancelled") throw new RunError(`Run is ${run.status}.`);
  const keys = Object.keys(run.plan.discover);
  const uc = typeof useCase === "string" && useCase ? useCase : keys.length === 1 ? keys[0] : "";
  const where = run.plan.discover[uc];
  if (!where) throw new RunError(`use_case must be one of: ${keys.join(", ")}`);
  const parsed = discoveriesSchema.safeParse(places);
  if (!parsed.success) throw new RunError(`Places don't match the format: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);

  const farKm = Math.max(where.radiusKm, where.mustDoKm ?? 0);
  const index = await placesNear({ ...where.center, radiusM: farKm * 1000 + 2000 }, where.layers);
  const known = new Set(where.known);
  const pc = run.plan.categories[uc];
  const taken = new Set(Object.values(run.plan.categories).flatMap((c) => c.candidates.map((x) => x.osmRef)));
  let n = Object.values(run.plan.categories).reduce((s, c) => s + c.candidates.length, 0);
  const onMap: string[] = [];
  const offMap: string[] = [];
  const events: string[] = [];
  const skipped: string[] = [];
  const far: string[] = [];
  const rows: Parameters<typeof saveReviews>[2] = [];
  for (const d of parsed.data) {
    // An event isn't a map place (its venue is), so events are never matched or flagged "not on the map".
    const isEvent = !!d.event_start;
    const m = isEvent ? null : matchToIndex(d, index);
    const osmRef = m?.osmRef ?? extRef(d);
    if (known.has(osmRef)) {
      skipped.push(`${d.name} (already known)`);
      continue;
    }
    if (taken.has(osmRef)) {
      skipped.push(`${d.name} (twice)`);
      continue;
    }
    taken.add(osmRef);
    const pos = m ? { lat: m.lat, lng: m.lng } : { lat: d.lat, lng: d.lng };
    const km = distanceMeters(where.center, pos) / 1000;
    if (km > farKm + 2) far.push(`${d.name} (${km.toFixed(1)} km)`);
    else if (km > where.radiusKm + 2 && !d.must_do_reason) far.push(`${d.name} (${km.toFixed(1)} km, no must_do_reason)`);
    if (where.window && d.event_start && (d.event_start > where.window.to || (d.event_end ?? d.event_start) < where.window.from)) far.push(`${d.name} (dates ${d.event_start} outside ${where.window.from}…${where.window.to})`);
    const id = `x${++n}`;
    const c: Candidate = { id, category: uc, family: where.family, osmRef, name: m?.name ?? d.name, kind: isEvent ? "event" : "discovered", score: d.score ?? 0, why: [m ? `on OpenStreetMap (${m.how}, ${m.distanceM} m from the agent's pin, names ${Math.round(m.similarity * 100)} % alike)` : "not on OpenStreetMap"], near: `${km.toFixed(1)} km from ${where.center.label}`, tile: geohash(pos, 5), tags: {}, served: true, ...pos };
    pc.candidates.push(c);
    (isEvent ? events : m ? onMap : offMap).push(c.name);
    const rest: Partial<DiscoveryInput> = { ...d };
    delete rest.name;
    delete rest.lat;
    delete rest.lng;
    const review = { candidate: id, ...rest, ...(isEvent ? {} : { on_map: !!m }), ...(m ? { osm_match: { how: m.how, distance_m: m.distanceM, similarity: m.similarity, agent_name: d.name } } : {}), agent_pin: { lat: d.lat, lng: d.lng } } as unknown as ReviewInput;
    rows.push({ review, category: uc, osmRef, name: c.name, lat: pos.lat, lng: pos.lng });
  }
  await saveReviews(run.id, agent, rows);
  const saved = await reviewsOf(run.id);
  const counters = { ...run.counters, reviews: saved.length, kept: saved.filter((r) => r.keep).length };
  await updateRun(run.id, { plan: run.plan, counters });
  await logEvent(run.id, { kind: "discover.answer", summary: `${uc}: ${rows.length} saved — ${onMap.length} on OpenStreetMap, ${offMap.length} not on the map${skipped.length ? `, ${skipped.length} skipped` : ""} (AI)`, data: { useCase: uc, onMap, offMap, skipped, far } });
  const lines = [
    `Saved ${rows.length} for ${uc} (run total ${saved.length}, kept ${counters.kept}).`,
    `On OpenStreetMap: ${onMap.length}${onMap.length ? ` — ${onMap.join(", ")}` : ""}.`,
    `Not on the map (kept with your link, marked for the family to check): ${offMap.length}${offMap.length ? ` — ${offMap.join(", ")}` : ""}.`,
    ...(events.length ? [`Events (dated, not map places): ${events.length} — ${events.join(", ")}.`] : []),
    ...(skipped.length ? [`Skipped: ${skipped.join(", ")}.`] : []),
    ...(far.length ? [`Check: ${far.join(", ")}.`] : []),
  ];
  return { text: lines.join("\n"), saved: rows.length, onMap: onMap.length, offMap: offMap.length, skipped: skipped.length };
}

/** Pasted discover answers: {"discoveries": {"cafes": [...]}} or any shape where places sit under their use case key. */
export function discoveriesIn(json: unknown, useCases: string[]): Map<string, Array<Record<string, unknown>>> {
  const out = new Map<string, Array<Record<string, unknown>>>();
  const walk = (v: unknown, uc: string | null) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, uc));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string" && typeof o.lat === "number" && typeof o.lng === "number") {
      const key = (typeof o.use_case === "string" && useCases.includes(o.use_case) ? o.use_case : uc) ?? (useCases.length === 1 ? useCases[0] : null);
      if (key) out.set(key, [...(out.get(key) ?? []), o]);
      return;
    }
    for (const [k, x] of Object.entries(o)) walk(x, useCases.includes(k) ? k : uc);
  };
  walk(json, null);
  return out;
}
