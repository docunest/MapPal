// The brief pipeline. preview_briefs is free (place index + rules); after the
// owner's yes, get_briefs hands the agent every brief at once — shared layers
// (charter, output format, location) once, then per use case its rules, the
// known places (negative list) and the places to judge with photos.
// submit_results stores verdicts against the brief. Each step is logged
// under the pull's id.
import { randomBytes } from "node:crypto";
import { distanceMeters } from "@/lib/geo";
import { localLangsAt } from "@/lib/nearby/region";
import { capsFromEnv, imageTokens, textTokens } from "../domain/caps";
import { hintsLayer, knownLayer, locationLayer, usecaseLayer } from "../domain/brief";
import { digestText } from "../domain/digest";
import { geohash } from "../domain/geohash";
import { shortHash } from "../domain/hash";
import { spread } from "../domain/plan";
import { condHolds, runProfile, type Profile } from "../domain/profile";
import { travelState } from "../domain/travelState";
import { emptyCounters, type Candidate, type OsmThing, type Plan, type PlanCategory, type Zone } from "../domain/types";
import { EXPLORE_RADIUS_M, pickZone } from "../domain/zone";
import { knownPlaces, markSubmittedIfDone, pageNumber, saveBrief, getBrief, voteHints } from "../infrastructure/briefs";
import { enrich, googleConfigured } from "../infrastructure/enrich";
import { logEvent } from "../infrastructure/events";
import { indexArea, placesNear } from "../infrastructure/osmIndex";
import { createRun, savePayload, updateRun } from "../infrastructure/repo";
import { currentRule, loadUseCaseTree, type RuleView } from "../infrastructure/rules";
import { chainOf, expand, rootOf, selectsBelow } from "../domain/tree";
import { CONTRACT_LINE, CONTRACT_VERSION } from "../domain/review";
import { loadFixes } from "../infrastructure/travelSources";
import { RunError } from "./guard";
import { submitReviews, type AgentReply } from "./runFlow";

export interface BriefArgs {
  lat?: number;
  lng?: number;
  label?: string;
  use_cases?: string[];
  page_size?: number;
}

interface Prepared {
  runId: string;
  zone: Zone;
  estimateLine: string | null;
  travelWhy: string | null;
  indexNote: string;
  useCases: Array<{ rule: RuleView; chain: RuleView[]; family: string[]; profile: Profile; found: number; dropped: PlanCategory["dropped"]; known: Map<string, { name: string }>; page: Candidate[]; rest: Candidate[]; pageNo: number; areaKey: string }>;
  charter: RuleView;
  format: RuleView;
  titles: Record<string, string>; // use case → "Food › Cool bars"
}

export const newId = (p: string) => `${p}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;

export async function prepare(args: BriefArgs, runId: string, indexBudgetMs: number): Promise<Prepared> {
  const state = travelState(await loadFixes());
  let target: Zone["target"];
  if (typeof args.lat === "number" && typeof args.lng === "number") {
    target = { lat: args.lat, lng: args.lng, label: args.label?.slice(0, 80) || `${args.lat.toFixed(4)}, ${args.lng.toFixed(4)}`, source: "given by the agent" };
  } else {
    if (!state.target) throw new RunError("No location known from any source. Pin it (set_location) or pass lat/lng.");
    target = { lat: state.target.lat, lng: state.target.lng, label: state.target.label, source: state.target.source, at: state.target.at.toISOString() };
  }
  const e = state.estimate;
  await logEvent(runId, {
    kind: "location.hints",
    summary: `${state.hints.length} position hints, ${state.destinations.length} destinations`,
    data: {
      hints: state.hints.slice(0, 60).map((h) => ({ label: h.label, source: h.source, lat: h.lat, lng: h.lng, at: h.at, ageH: Math.round(h.ageH * 10) / 10, weight: Math.round(h.weight * 100) / 100, used: h.used, note: h.note })),
      destinations: state.destinations.slice(0, 20).map((d) => ({ label: d.label, source: d.source, lat: d.lat, lng: d.lng, at: d.at })),
    },
  });
  if (e) await logEvent(runId, { kind: "location.estimate", summary: `best guess ${e.label} ±${e.accuracyKm} km, confidence ${Math.round(e.confidence * 100)} %`, data: e, lat: e.lat, lng: e.lng });
  const estimateLine = e ? `${e.label} (${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}) ±${e.accuracyKm} km, confidence ${Math.round(e.confidence * 100)} %, from ${e.from.length} hint(s)` : null;
  await logEvent(runId, { kind: "target", summary: `target ${target.label} (${target.source})`, data: { target, travel: state.why, estimate: e }, lat: target.lat, lng: target.lng });

  const progress = await indexArea(target, EXPLORE_RADIUS_M / 1000 + 1, runId, indexBudgetMs);
  const gaps = [...progress.failed.map((f) => f.cell), ...progress.missing];
  const indexNote = `Place index: ${progress.cells} cells around the target — ${progress.fresh.length} stored, ${progress.fetched.length} fetched now${gaps.length ? `, ${gaps.length} missing (${gaps.join(", ")}): places there aren't included — fill them with index_area or from Browse` : ""}.`;
  const zone = pickZone(target, await placesNear({ ...target, radiusM: 14_000 }, ["stay", "town"]));
  await logEvent(runId, { kind: "zone", summary: zone.why, data: { campsite: zone.campsite, towns: zone.towns, cafeCircles: zone.cafeCircles, explore: zone.explore }, lat: zone.campsite.lat, lng: zone.campsite.lng });

  const [charter, format, uc] = await Promise.all([currentRule("charter"), currentRule("output-format"), loadUseCaseTree()]);
  // A group (Food) means all of its use cases (Cafes, Cool bars…). Only use cases with their own "select" run.
  const asked = args.use_cases?.length ? expand(uc.tree, args.use_cases) : null;
  const wanted = uc.tree.filter((e) => e.runs && (!asked || asked.has(e.key)));
  if (!wanted.length) throw new RunError(`No such use case. Known: ${uc.tree.map((e) => `${"  ".repeat(e.depth)}${e.key}${e.runs ? "" : " (group)"}`).join(", ")}`);
  const useCases: Prepared["useCases"] = [];
  for (const entry of wanted) {
    const rule = entry.item;
    let resolved: ReturnType<typeof uc.resolve>;
    try {
      resolved = uc.resolve(entry.key);
    } catch (e) {
      await logEvent(runId, { kind: "rules", summary: `${entry.key}: skipped — its rules don't resolve (${e instanceof Error ? e.message.slice(0, 200) : String(e)})`, data: { useCase: entry.key } });
      continue;
    }
    const p = resolved.profile;
    // Off by default (Food): only when asked for by name or by its group.
    if (!asked && p.offByDefault) continue;
    let things: OsmThing[];
    if (!p.select.length) things = []; // discover-only: agents find the places, no map list
    else if (p.area.kind === "towns") {
      const m = new Map<string, OsmThing>();
      for (const c of zone.cafeCircles) for (const t of await placesNear(c, p.layers)) m.set(t.ref, t);
      things = [...m.values()];
    } else things = await placesNear({ ...zone.explore, radiusM: p.area.km * 1000 }, p.layers);
    const parkings = p.parkingWithinM ? await placesNear({ ...zone.explore, radiusM: (p.area.kind === "radius" ? p.area.km * 1000 : 3000) + p.parkingWithinM }, ["parking"]) : [];
    const r = runProfile(p, things, zone, parkings);
    const below = selectsBelow(uc.tree, p.useCase);
    if (below.length) r.candidates = r.candidates.filter((c) => !below.some((s) => condHolds(s, c.tags)));
    const family = rootOf(uc.tree, p.useCase);
    for (const c of r.candidates) c.family = family;
    // Negative list across the whole tree (a bar judged as "Cafes" before the split isn't sent again as "Cool bars").
    const known = await knownPlaces([...expand(uc.tree, [family])], { ...zone.explore, radiusM: Math.max(zone.explore.radiusM, 20_000) });
    // Known = same OSM element, or the same name within 300 m (one place mapped twice, e.g. a relation and its way).
    const knownNear = [...known.values()].filter((k) => k.lat !== undefined);
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const sameWithin = Math.max(300, p.dedupeByNameWithinM);
    const fresh = r.candidates.filter((c) => !known.has(c.osmRef) && !knownNear.some((k) => norm(k.name) === norm(c.name) && distanceMeters(c, { lat: k.lat!, lng: k.lng! }) < sameWithin));
    const size = Math.min(50, Math.max(1, args.page_size ?? p.pageSize));
    const page = p.spreadByTown ? spread(fresh, size) : fresh.slice(0, size);
    const areaKey = `${p.useCase}:${geohash(zone.campsite, 6)}`;
    useCases.push({ rule, chain: resolved.chain, family: [...expand(uc.tree, [family])], profile: p, found: r.found, dropped: r.dropped, known, page, rest: fresh.filter((c) => !page.includes(c)), pageNo: await pageNumber(p.useCase, areaKey), areaKey });
    await logEvent(runId, {
      kind: "rules",
      summary: `${p.useCase} (rules ${resolved.chain.map((c) => `${c.config?.useCase} v${c.version}`).join(" › ")}): ${r.found} in the index → ${r.dropped.length} dropped, ${known.size} known (negative list), ${page.length} on this page, ${fresh.length - page.length} more after it`,
      data: { useCase: p.useCase, ruleVersion: rule.version, ruleHash: rule.hash, chain: resolved.chain.map((c) => ({ slug: c.slug, version: c.version, hash: c.hash })), found: r.found, dropped: r.dropped, known: known.size, page: page.map((c) => ({ name: c.name, osmRef: c.osmRef, lat: c.lat, lng: c.lng, score: c.score, why: c.why })) },
    });
  }
  const titles = Object.fromEntries(uc.tree.map((e) => [e.key, chainOf(uc.tree, e.key).map((x) => x.title).join(" › ")]));
  return { runId, zone, estimateLine, travelWhy: args.lat === undefined ? state.why : null, indexNote, useCases, charter, format, titles };
}

const reasonsOf = (dropped: PlanCategory["dropped"]) => {
  const m: Record<string, number> = {};
  for (const d of dropped) {
    const k = d.reason.replace(/ \(.*\)$/, "");
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
};

/** Free: what a pull would contain. Show it to the owner; get_briefs needs their yes. */
export async function previewBriefs(args: BriefArgs) {
  const runId = newId("prev");
  const p = await prepare(args, runId, 30_000);
  const caps = capsFromEnv();
  const total = p.useCases.reduce((s, u) => s + u.page.length, 0);
  const lines = [
    `PREVIEW ${runId} — nothing spent. Layers: charter v${p.charter.version} · ${p.charter.hash}, output format v${p.format.version} · ${p.format.hash}.`,
    `Target: ${p.zone.target.label}. ${p.zone.why}`,
    p.travelWhy ? `Location: ${p.travelWhy}` : "",
    p.indexNote,
    ...p.useCases.map(
      (u) =>
        `${u.chain.map((c) => c.title).join(" › ")} (rules ${u.chain.map((c) => `v${c.version} · ${c.hash}`).join(" › ")}), page ${u.pageNo}: ${u.found} in the index → ${u.dropped.length} dropped by rules, ${u.known.size} already known, ${u.page.length} to judge now, ${u.rest.length} left for later pages. First: ${u.page.slice(0, 6).map((c) => c.name).join(" · ") || "—"}`,
    ),
    `A pull would send ${Math.min(total, caps.places)} places (cap ${caps.places}); server caps: ${caps.tokens} tokens, ${caps.images} images, ${caps.pages} pages, ${caps.googleDetails} Google details.`,
    "Show this to the owner and wait for a yes. Then call get_briefs with the same arguments and owner_approved=true.",
  ];
  return { text: lines.filter(Boolean).join("\n"), runId };
}

/** After the owner's yes: every brief at once. */
/**
 * opts.manual: for pasting into any chat agent by hand (/review → Browse →
 * Manual run). Text only — photos as links, nothing attached — and the end
 * says to answer with one JSON object, pasted back into the app.
 */
export async function pullBriefs(args: BriefArgs & { owner_approved?: unknown }, agent: string, baseUrl: string, opts: { manual?: boolean } = {}): Promise<AgentReply & { runId: string; briefIds: string[] }> {
  const manual = opts.manual === true;
  if (args.owner_approved !== true) throw new RunError("owner_approved must be true — only after the owner said yes to preview_briefs.");
  const runId = newId("run");
  const caps = capsFromEnv();
  const p = await prepare(args, runId, 15_000);
  const place = await localLangsAt(p.zone.target);
  const lang = place.country?.toUpperCase() === "PT" ? "pt" : "es";
  const google = googleConfigured();
  const counters = emptyCounters();
  const loc = locationLayer(p.zone, p.estimateLine);

  // Ids per use case (c1, c2… / e1…) and the plan the review app and debug page read.
  const categories: Plan["categories"] = {};
  let budgetPlaces = caps.places;
  for (const u of p.useCases) {
    const take = u.page.slice(0, Math.max(0, budgetPlaces));
    budgetPlaces -= take.length;
    const ids = take.map((c, i) => ({ ...c, id: `${u.profile.idPrefix}${i + 1}` }));
    categories[u.profile.useCase] = {
      found: u.found,
      dropped: u.dropped,
      cached: [...u.known.values()].map((k) => k.name).slice(0, 300),
      candidates: ids,
      overCap: u.rest.length + (u.page.length - take.length),
      backlog: [...u.page.slice(take.length), ...u.rest].slice(0, 400).map((c, i) => ({ ...c, id: `b${u.profile.idPrefix}${i + 1}` })),
    };
  }
  const plan: Plan = {
    zone: p.zone,
    categories,
    estimate: { servedTokens: 0, pages: 0, images: 0, googleDetails: 0, googlePhotos: 0, agentTurns: 0, outputTokens: 0, cachedRereadTokens: 0, text: "measured, see the cost log" },
    google,
    notes: [p.indexNote, ...(p.travelWhy ? [`Location: ${p.travelWhy}`] : [])],
    lang,
    country: place.country,
  };
  await createRun(agent, plan, caps, counters, runId);
  await updateRun(runId, { status: "running", approvedAt: new Date() });

  const shared = `# MapPal briefs — pull ${runId}
${manual ? "Manual run: you have no tools here — answer at the very end with ONE JSON object (see \"How to answer\" at the bottom)." : "Answer each brief with submit_results(brief_id, results)."} Pull page: ${baseUrl}/agent/runs/${runId}

## 1. Charter (v${p.charter.version} · ${p.charter.hash})
${p.charter.body}

## 2. Output format (v${p.format.version} · ${p.format.hash})
${p.format.body}
${CONTRACT_LINE}

## 3. Location (· ${loc.hash})
${loc.text}`;
  const sharedTokens = textTokens(shared);
  counters.tokens += sharedTokens;
  counters.textTokens += sharedTokens;
  const images: NonNullable<AgentReply["images"]> = [];
  let pending = shared;
  let saved = shared; // the same text with photos as links, stored for get_pull
  let capHit: string | null = null;
  const briefIds: string[] = [];

  for (const u of p.useCases) {
    const pc = categories[u.profile.useCase];
    if (!pc.candidates.length) continue;
    const briefId = newId("brf");
    briefIds.push(briefId);
    const known = knownLayer([...u.known].map(([osmRef, k]) => ({ osmRef, name: k.name })));
    const hints = hintsLayer(await voteHints(u.family, p.titles), p.titles[u.profile.useCase] ?? u.profile.useCase, p.titles[u.family[0]] ?? u.family[0]);
    const ucText = usecaseLayer(u.profile, u.chain.map((c) => ({ title: c.title, body: c.body, version: c.version, hash: c.hash })), { found: u.found, dropped: reasonsOf(u.dropped) });
    let briefText = `\n\n# Brief ${briefId} — ${u.profile.title}, page ${u.pageNo}\n${ucText}\n\n${known.text}\n\n${hints.text}\n\n## 7. Places to judge (${pc.candidates.length})`;
    let briefTokens = textTokens(briefText);
    counters.tokens += briefTokens;
    counters.textTokens += briefTokens;
    pending += briefText;
    saved += briefText;
    // Facts and photos in parallel (5 at a time), then counted in order.
    const enriched: Awaited<ReturnType<typeof enrich>>[] = [];
    for (let i = 0; i < pc.candidates.length; i += 5) {
      const slice = pc.candidates.slice(i, i + 5);
      enriched.push(
        ...(await Promise.all(
          slice.map((c, j) => {
            const n = i + j;
            return enrich(c, { googleDetails: counters.googleDetails + n < caps.googleDetails, googlePhotos: counters.googlePhotos + n < caps.googlePhotos, images: counters.images + n < caps.images, pages: counters.pages + n < caps.pages }, lang);
          }),
        )),
      );
    }
    const sent: Array<{ id: string; osmRef: string; name: string; lat: number; lng: number }> = [];
    for (let i = 0; i < pc.candidates.length; i++) {
      const c = pc.candidates[i];
      const e = enriched[i];
      counters.googleDetails += e.spent.googleDetails;
      counters.googlePhotos += e.spent.googlePhotos;
      counters.pages += e.spent.pages;
      const text = digestText(c, e.enrichment, { photoLinks: manual });
      const tt = textTokens(text);
      const it = e.image && !manual ? imageTokens(e.image.width, e.image.height) : 0;
      if (counters.tokens + tt + it > caps.tokens) {
        capHit = `content tokens cap reached after ${sent.length} places of ${u.profile.title}`;
        break;
      }
      counters.tokens += tt + it;
      counters.textTokens += tt;
      counters.imageTokens += it;
      briefTokens += tt + it;
      if (e.image && !manual) counters.images += 1;
      counters.served[u.profile.useCase] = (counters.served[u.profile.useCase] ?? 0) + 1;
      c.served = true;
      c.googlePlaceId = e.googlePlaceId;
      if (e.enrichment.photo && e.enrichment.photo.source !== "google") c.photo = { source: e.enrichment.photo.source, page: e.enrichment.photo.page, credit: e.enrichment.photo.credit, url: e.enrichment.photo.url };
      sent.push({ id: c.id, osmRef: c.osmRef, name: c.name, lat: c.lat, lng: c.lng });
      briefText += `\n\n${text}`;
      pending += `\n\n${text}`;
      saved += `\n\n${text}${c.photo?.url && !manual ? `\nPhoto: ${c.photo.url}` : ""}`;
      if (e.image && !manual) {
        images.push({ before: pending, image: e.image });
        pending = "";
      }
      await logEvent(runId, { kind: "batch.place", summary: `${briefId} ${c.id} ${c.name}: ${tt + it} tokens (text ${tt}, photo ${it})${e.spent.googleDetails ? ", Google" : ""}`, data: { brief: briefId, candidate: c.id, useCase: u.profile.useCase, osmRef: c.osmRef, textTokens: tt, imageTokens: it, spent: e.spent, photo: e.enrichment.photo?.source }, tokens: tt + it, lat: c.lat, lng: c.lng });
    }
    pc.candidates = pc.candidates.filter((c) => c.served);
    const layers = {
      charter: { version: p.charter.version, hash: p.charter.hash },
      format: { version: p.format.version, hash: p.format.hash },
      location: { hash: loc.hash },
      usecase: { slug: u.rule.slug, version: u.rule.version, hash: u.rule.hash, parents: u.chain.slice(0, -1).map((c) => ({ slug: c.slug, version: c.version, hash: c.hash })) },
      known: { hash: known.hash, count: u.known.size },
      hints: { hash: hints.hash, likes: hints.likes, dislikes: hints.dislikes },
      contract: CONTRACT_VERSION,
    };
    await saveBrief({ id: briefId, runId, useCase: u.profile.useCase, page: u.pageNo, layers, area: { key: u.areaKey, target: p.zone.target, campsite: p.zone.campsite }, candidates: sent, excluded: u.known.size, hash: shortHash(shared, briefText), tokens: briefTokens, agent });
    await logEvent(runId, { kind: "brief", summary: `${briefId}: ${u.profile.title} page ${u.pageNo}, ${sent.length} places, ${u.known.size} known excluded, ${briefTokens} tokens (rules v${u.rule.version})`, data: { briefId, layers, sent: sent.length }, tokens: briefTokens });
    if (capHit) break;
  }
  await updateRun(runId, { plan, counters, ...(capHit ? { status: "capped", cappedBy: capHit } : {}) });
  if (capHit) await logEvent(runId, { kind: "cap", summary: `CAP HIT: ${capHit}`, data: { counters } });
  const footer = manual
    ? `\n\n---\n## How to answer (manual run ${runId})\nYou can't call submit_results here. Reply with ONE JSON object and nothing else — the family pastes it back into MapPal:\n{"run_id": "${runId}", "briefs": {${briefIds.map((b) => `"${b}": [ … ]`).join(", ") || "\"(none)\": []"}}}\nEach list holds one result per place of that brief, in the output format of layer 2 ("candidate" = the id shown, like ${Object.values(categories).flatMap((c) => c.candidates.map((x) => x.id)).slice(0, 3).join(", ") || "c1"}). Judge every place; skip none. If you can open web pages, you may check a place's website or photos; otherwise judge from the facts given.${capHit ? `\nNote: the server stopped early (${capHit}); judge what is here.` : ""}`
    : `\n\n---\nBriefs: ${briefIds.join(", ") || "none (nothing new to judge here — every place is known)"}. Sent ${counters.tokens} tokens (text ${counters.textTokens}, images ${counters.imageTokens}), ${counters.images} photos, Google ${counters.googleDetails} details.${capHit ? `\nCAP HIT: ${capHit}. Judge what you got, submit, finish_run.` : ""}\nNext: submit_results for each brief (≤ 20 per call), then finish_run(run_id="${runId}") with the owner's /usage numbers and usage.mjs.`;
  await savePayload(runId, `${saved}${footer}`);
  return { runId, text: `${pending}${footer}`, images, briefIds };
}

export async function submitResults(briefId: unknown, results: unknown, agent: string): Promise<AgentReply> {
  if (typeof briefId !== "string") throw new RunError("brief_id is required");
  const b = await getBrief(briefId);
  if (!b) throw new RunError(`No brief ${briefId}`);
  const ids = new Set((b.candidates as Array<{ id: string }>).map((c) => c.id));
  const list = Array.isArray(results) ? results : [];
  const foreign = list.map((r) => (r as { candidate?: string }).candidate).filter((c) => !c || !ids.has(c));
  if (foreign.length) throw new RunError(`Not in brief ${briefId}: ${foreign.join(", ")}. Its places: ${[...ids].join(", ")}`);
  const reply = await submitReviews(b.runId, list, agent, briefId);
  await markSubmittedIfDone(briefId);
  return reply;
}
