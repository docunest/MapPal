// Scenario pipeline (docs/PLAN.md → "Agent pipeline"): brand matching,
// bottom-up query/candidates, validator verdicts and AI checks, render-time
// tiers (incl. a Spanish Sunday), top-down plan merging and privacy, DeepSeek
// usage tracking. Real OSM data from test/fixtures where it matters.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AiClient } from "../lib/ai/deepseek";
import { AiCappedError, deepseekBalance, deepseekClient, parseJsonReply } from "../lib/ai/deepseek";
import { evaluateHours, loadOpeningHours } from "../lib/openingHours";
import { buildBottomUpQuery, candidatesFromElements, frequentNames, type Candidate } from "../lib/scenarios/bottomUp";
import { brandsFor, matchBrand, normalize } from "../lib/scenarios/brands";
import { DEFAULT_SCENARIOS } from "../lib/scenarios/defaults";
import { runPipeline } from "../lib/scenarios/pipeline";
import { iberianTimeZone, localWallClock, rankAndTier } from "../lib/scenarios/tiers";
import { mergePlan, seedPlan, topDownMessages, topDownPlan } from "../lib/scenarios/topDown";
import type { ResultItem } from "../lib/scenarios/types";
import { dedupe, isUncertain, ruleVerdict, validate, type AiCheck } from "../lib/scenarios/validate";
import { createUsageGuard, memoryUsageStore } from "../lib/sources/usage";
import { osmFixture } from "./helpers";

const groceries = DEFAULT_SCENARIOS.find((s) => s.slug === "groceries")!;
const construction = DEFAULT_SCENARIOS.find((s) => s.slug === "construction-stores")!;
const NOW = new Date("2026-11-06T12:00:00Z");

function fakeAi(answer: (system: string, user: string) => unknown, calls: string[] = []): AiClient {
  return {
    label: "ai:fake",
    async chatJson(system, user) {
      calls.push(user);
      return { json: answer(system, user), model: "fake-model", tokensIn: 100, tokensOut: 20 };
    },
  };
}

function cand(over: Partial<Candidate> & { tags: Record<string, string> }): Candidate {
  return {
    key: `osm:node/${over.osmRef ?? "1"}`,
    osmRef: "node/1",
    name: over.tags.name ?? "x",
    lat: 39.66,
    lng: -0.23,
    kind: over.tags.shop ? `shop=${over.tags.shop}` : "shop",
    matchedBy: [],
    ...over,
  };
}

// --- brands ------------------------------------------------------------------

test("brand matching: whole words, accents ignored, longest brand wins", () => {
  const es = brandsFor(groceries.config.brands, "ES");
  assert.equal(normalize("Brico Dépôt"), "brico depot");
  assert.deepEqual(matchBrand(["Carrefour Express"], es), { brand: "Carrefour Express", tier: 3 });
  assert.deepEqual(matchBrand(["Carrefour"], es), { brand: "Carrefour", tier: 1 });
  assert.deepEqual(matchBrand(["Mi Alcampo"], es), { brand: "Mi Alcampo", tier: 3 });
  assert.deepEqual(matchBrand(["Ahorramás"], es), { brand: "Ahorramas", tier: 2 });
  assert.equal(matchBrand(["Peluquería Diana"], es), undefined, "Dia must not match inside Diana");
  const pt = brandsFor(groceries.config.brands, "PT");
  assert.deepEqual(matchBrand(["Continente Bom Dia"], pt), { brand: "Continente Bom Dia", tier: 3 });
  assert.deepEqual(matchBrand(["Continente"], pt), { brand: "Continente", tier: 1 });
  // "*" brands apply in every country
  assert.deepEqual(matchBrand(["Leroy Merlin Sagunto"], brandsFor(construction.config.brands, "ES")), { brand: "Leroy Merlin", tier: 1 });
});

// --- bottom-up ---------------------------------------------------------------

test("bottom-up query: scenario tags, keywords and whole-word brands within the stop radius", () => {
  const q = buildBottomUpQuery({ lat: 39.665, lng: -0.233 }, 15000, construction.config, seedPlan(construction.config, "ES"));
  assert.match(q, /nwr\["shop"="doityourself"\]\(around:15000,39\.66500,-0\.23300\);/);
  assert.match(q, /\["name"~"[^"]*ferreter[^"]*",i\]/);
  assert.match(q, /\(\^\|\[\^\[:alnum:\]\]\)\([^)]*\bLeroy Merlin\b[^)]*\)/);
  assert.match(q, /out center meta qt;/);
});

test("bottom-up candidates on real Madrid OSM data: chains get their tier, frequent unknown names are proposed", () => {
  const fx = osmFixture("madrid-lavapies");
  const cands = candidatesFromElements(fx.elements, groceries.config, seedPlan(groceries.config, "ES"));
  const merc = cands.find((c) => c.name === "Mercadona");
  assert.ok(merc, "Mercadona found");
  assert.deepEqual(merc!.matchedBy.find((m) => m.by === "brand"), { by: "brand", brand: "Mercadona", tier: 2, via: "brand-tag" });
  const dia = cands.filter((c) => c.matchedBy.some((m) => m.by === "brand" && m.brand === "Dia"));
  assert.ok(dia.length >= 10, `Dia stores: ${dia.length}`);
  for (const c of cands) assert.ok(c.matchedBy.length > 0);
  // No duplicates of the brand-matched chains among frequent-name proposals.
  assert.ok(!frequentNames(cands).some((f) => normalize(f.name) === "dia"));
});

// --- validator -----------------------------------------------------------------

test("validator: same shop mapped twice within 150 m is merged, richer record kept", () => {
  const a = cand({ osmRef: "node/1", key: "osm:node/1", tags: { name: "Ferretería Suiza", shop: "hardware" }, matchedBy: [{ by: "tag", tag: "shop=hardware" }] });
  const b = cand({
    osmRef: "way/2",
    key: "osm:way/2",
    lat: 39.6603,
    tags: { name: "Ferreteria Suiza", shop: "hardware", opening_hours: "Mo-Fr 09:00-13:30" },
    matchedBy: [{ by: "keyword", keyword: "ferreter" }],
  });
  const out = dedupe([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "osm:way/2");
  assert.equal(out[0].matchedBy.length, 2);
});

test("validator rules: real / stale / unverified from map evidence", () => {
  const brand = { by: "brand" as const, brand: "Mercadona", tier: 2, via: "brand-tag" as const };
  assert.equal(ruleVerdict(cand({ tags: { name: "Mercadona", shop: "supermarket" }, matchedBy: [brand], lastEdited: "2024-05-01" }), NOW).verdict, "real");
  assert.equal(
    ruleVerdict(cand({ tags: { name: "Ferretería X", shop: "hardware", opening_hours: "Mo-Sa 09:00-13:00", phone: "+34 1" }, lastEdited: "2021-01-01" }), NOW).verdict,
    "real",
  );
  const stale = ruleVerdict(cand({ tags: { name: "Bazar Y", shop: "variety_store" }, lastEdited: "2015-03-01" }), NOW);
  assert.equal(stale.verdict, "stale");
  assert.match(stale.evidence.at(-1)!.text, /not touched for 11 years/);
  // A recent survey date counts even when the element itself is old.
  assert.equal(ruleVerdict(cand({ tags: { name: "Bazar Y", shop: "variety_store", check_date: "2026-02-01" }, lastEdited: "2015-03-01" }), NOW).verdict, "real");
  assert.equal(ruleVerdict(cand({ tags: { name: "Tienda Z", shop: "hardware" }, lastEdited: "2022-01-01" }), NOW).verdict, "unverified");
});

test("validator: uncertain matches go to the AI; 'no' is dropped with the reason, 'yes' is labelled AI", async () => {
  const cfg = construction.config;
  const bazaarTools = cand({ osmRef: "node/10", key: "osm:node/10", tags: { name: "Bazar Oriental", shop: "variety_store" }, matchedBy: [{ by: "tag", tag: "shop=variety_store" }], lastEdited: "2025-06-01" });
  const bazaarClothes = cand({ osmRef: "node/11", key: "osm:node/11", lat: 39.67, tags: { name: "Bazar Moda", shop: "clothes" }, matchedBy: [{ by: "keyword", keyword: "bazar" }], lastEdited: "2025-06-01" });
  const leroy = cand({
    osmRef: "way/12",
    key: "osm:way/12",
    lat: 39.68,
    tags: { name: "Leroy Merlin", shop: "doityourself", brand: "Leroy Merlin" },
    matchedBy: [{ by: "tag", tag: "shop=doityourself" }, { by: "brand", brand: "Leroy Merlin", tier: 1, via: "brand-tag" }],
    lastEdited: "2025-01-01",
  });
  assert.equal(isUncertain(leroy, cfg), false);
  assert.equal(isUncertain(bazaarTools, cfg), true);
  assert.equal(isUncertain(bazaarClothes, cfg), true);
  const calls: string[] = [];
  const ai = fakeAi(() => ({
    results: [
      { id: "node/10", match: "yes", reason: "Chinese bazaars usually stock basic tools" },
      { id: "node/11", match: "no", reason: "clothing shop" },
    ],
  }), calls);
  const out = await validate({ candidates: [bazaarTools, bazaarClothes, leroy], config: cfg, prompt: construction.prompt, scenarioSlug: "construction-stores", center: { lat: 39.66, lng: -0.23 }, now: NOW, ai, cachedChecks: new Map() });
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].includes("39.6"), "AI gets names and tags, not coordinates");
  assert.deepEqual(out.items.map((i) => i.name).sort(), ["Bazar Oriental", "Leroy Merlin"]);
  const b = out.items.find((i) => i.name === "Bazar Oriental")!;
  assert.equal(b.verdictByAi, true);
  assert.ok(b.evidence.some((e) => e.source === "ai:fake-model" && /AI: matches/.test(e.text)));
  assert.equal(b.tier, 3);
  assert.equal(out.items.find((i) => i.name === "Leroy Merlin")!.big, true);
  assert.match(out.dropped.find((d) => d.name === "Bazar Moda")!.reason, /^AI \(fake-model\): not a construction/);
  assert.equal(out.newChecks.size, 2);
  assert.equal(out.tokensIn, 100);

  // Second run: cached checks are reused, the AI is not asked again.
  const cached = new Map<string, AiCheck>(out.newChecks);
  const calls2: string[] = [];
  const again = await validate({ candidates: [bazaarTools, bazaarClothes, leroy], config: cfg, prompt: construction.prompt, scenarioSlug: "construction-stores", center: { lat: 39.66, lng: -0.23 }, now: NOW, ai: fakeAi(() => ({ results: [] }), calls2), cachedChecks: cached });
  assert.equal(calls2.length, 0);
  assert.equal(again.items.length, 2);

  // A chain's name on another kind of shop is dropped unless the AI confirms it.
  const travel = cand({ osmRef: "node/13", key: "osm:node/13", tags: { name: "Carrefour Viajes", shop: "travel_agency" }, matchedBy: [{ by: "brand", brand: "Carrefour", tier: 1, via: "name" }], lastEdited: "2025-06-01" });
  const noAi = await validate({ candidates: [travel], config: groceries.config, prompt: groceries.prompt, scenarioSlug: "groceries", center: { lat: 39.66, lng: -0.23 }, now: NOW, ai: null, cachedChecks: new Map() });
  assert.equal(noAi.items.length, 0);
  assert.match(noAi.dropped[0].reason, /Chain name on a different kind of shop \(shop=travel_agency\)/);

  // Without AI: uncertain places stay, as unverified, and the run says so.
  const off = await validate({ candidates: [bazaarTools, bazaarClothes, leroy], config: cfg, prompt: construction.prompt, scenarioSlug: "construction-stores", center: { lat: 39.66, lng: -0.23 }, now: NOW, ai: null, cachedChecks: new Map() });
  assert.equal(off.items.filter((i) => i.verdict === "unverified").length, 2);
  assert.ok(off.notes.some((n) => n.step === "ai" && n.status === "skipped"));
});

// --- tiers (render time) -----------------------------------------------------

function item(over: Partial<ResultItem>): ResultItem {
  return {
    key: `osm:node/${over.name}`,
    name: "x",
    lat: 39.665,
    lng: -0.233,
    kind: "shop=supermarket",
    tier: 4,
    tierLabel: "",
    big: false,
    verdict: "real",
    verdictByAi: false,
    evidence: [],
    matchedBy: [],
    sources: [{ source: "osm" }],
    ...over,
  };
}

test("Spanish Sunday: big stores stay with a red cross, small open shops surface, no-hours places are unverified", async () => {
  const OH = await loadOpeningHours();
  const at = { lat: 39.665, lng: -0.233 };
  const items = [
    item({ name: "Mercadona", tier: 2, big: true, lat: 39.67, openingHours: "Mo-Sa 09:00-21:30" }),
    item({ name: "Carrefour", tier: 1, big: true, lat: 39.68, openingHours: "Mo-Sa 09:00-22:00; Su off" }),
    item({ name: "Alimentación Paqui", tier: 5, lat: 39.666, openingHours: "Mo-Su 08:00-22:00" }),
    item({ name: "Panadería", tier: 5, lat: 39.6655, openingHours: "Mo-Su 07:00-14:00" }),
    item({ name: "Lidl", tier: 2, big: true, lat: 39.669 }),
    item({ name: "Super Thin", tier: 4, verdict: "unverified", openingHours: "Mo-Su 09:00-21:00" }),
  ];
  // Sunday 8 Nov 2026, 11:00 in Spain.
  const sunday = localWallClock(new Date("2026-11-08T10:00:00Z"), "Europe/Madrid");
  assert.equal(sunday.getDay(), 0);
  assert.equal(sunday.getHours(), 11);
  const t = rankAndTier(items, at, groceries.config, sunday, (i, now) => evaluateHours(OH, i.openingHours, { lat: i.lat, lng: i.lng, country: "ES" }, now));
  assert.deepEqual(t.closedToday.map((i) => i.name).sort(), ["Carrefour", "Mercadona"]);
  assert.ok(t.closedToday.every((i) => i.hours.state === "closed"));
  assert.deepEqual(t.recommended.map((i) => i.name).sort(), ["Alimentación Paqui", "Lidl", "Panadería"]);
  const lidl = t.recommended.find((i) => i.name === "Lidl")!;
  assert.equal(lidl.today, "unknown", "big store without hours ranks, but is never called open");
  assert.match(lidl.hours.label, /Hours unknown — check before driving/);
  assert.deepEqual(t.unverified.map((i) => i.name), ["Super Thin"]);

  // Same stores on a Monday morning: the big ones lead.
  const monday = localWallClock(new Date("2026-11-09T09:30:00Z"), "Europe/Madrid");
  const m = rankAndTier(items, at, groceries.config, monday, (i, now) => evaluateHours(OH, i.openingHours, { lat: i.lat, lng: i.lng, country: "ES" }, now));
  assert.equal(m.recommended[0].name, "Carrefour");
  assert.equal(m.recommended[0].hours.state, "open");
  assert.deepEqual(m.recommended.map((i) => i.name).slice(0, 3).sort(), ["Carrefour", "Lidl", "Mercadona"]);
  assert.equal(m.closedToday.length, 0);
});

test("opening later today counts as today, not as closed", async () => {
  const OH = await loadOpeningHours();
  const items = [item({ name: "Mercadona", tier: 2, big: true, openingHours: "Mo-Sa 09:00-21:30" })];
  const early = localWallClock(new Date("2026-11-09T06:00:00Z"), "Europe/Madrid"); // Monday 07:00
  const t = rankAndTier(items, { lat: 39.665, lng: -0.233 }, groceries.config, early, (i, now) => evaluateHours(OH, i.openingHours, { lat: i.lat, lng: i.lng, country: "ES" }, now));
  assert.equal(t.recommended[0].today, "later");
  assert.match(t.recommended[0].hours.label, /opens 09:00/);
});

test("time zones: Lisbon is an hour behind Madrid; Canaries by position", () => {
  const utc = new Date("2026-07-01T12:00:00Z");
  assert.equal(localWallClock(utc, "Europe/Madrid").getHours(), 14);
  assert.equal(localWallClock(utc, "Europe/Lisbon").getHours(), 13);
  assert.equal(iberianTimeZone({ lat: 41.185, lng: -8.695 }, "PT"), "Europe/Lisbon");
  assert.equal(iberianTimeZone({ lat: 28.1, lng: -15.4 }, "ES"), "Atlantic/Canary");
  assert.equal(iberianTimeZone({ lat: 43.3, lng: -4.8 }, "ES"), "Europe/Madrid");
});

// --- top-down ------------------------------------------------------------------

test("top-down: AI brands merged with seeds, unsafe tags dropped, no coordinates sent", async () => {
  const merged = mergePlan(brandsFor(groceries.config.brands, "ES"), {
    brands: [{ name: "Alimerka", tier: 2 }, { name: "Masymas", tier: 2 }, { name: "Supermercados Lupa", tier: 2 }],
    keywords: ["Ultramarinos"],
    extraTags: [["shop", "frozen_food"], ["name", "x\"];out;"], ["shop", "bad value"]],
  });
  assert.ok(merged.brands.find((t) => t.tier === 2)!.brands.includes("Supermercados Lupa"));
  assert.deepEqual(merged.keywords, ["ultramarinos"]);
  assert.deepEqual(merged.extraTags, [["shop", "frozen_food"]]);

  const { system, user } = topDownMessages(groceries.prompt, groceries.config, { country: "ES", area: "ES-AS", langs: ["es", "ast"] });
  assert.ok(!/-?\d+\.\d{3,}/.test(system + user), "no coordinates in the top-down prompt");

  const failed = await topDownPlan(groceries.prompt, groceries.config, { country: "ES", area: "ES-AS", langs: ["es"] }, fakeAi(() => "not json"));
  assert.equal(failed.plan.by, "defaults");
  assert.match(failed.plan.note!, /AI failed/);
  const ok = await topDownPlan(groceries.prompt, groceries.config, { country: "ES", area: "ES-AS", langs: ["es"] }, fakeAi(() => ({ brands: [{ name: "Alimerka", tier: 2 }], keywords: [], extraTags: [] })));
  assert.equal(ok.plan.by, "ai:fake-model");
});

// --- whole pipeline on real data ---------------------------------------------

test("pipeline on real Madrid (Lavapiés) OSM data, AI off: chains ranked, everything sourced", async () => {
  const fx = osmFixture("madrid-lavapies");
  const out = await runPipeline({
    scenario: { slug: "groceries", prompt: groceries.prompt, config: groceries.config },
    stop: { ...fx.center, radiusKm: 1, country: "ES", area: "ES-MD" },
    langs: ["es"],
    ai: null,
    overpass: async () => fx.elements,
    now: NOW,
  });
  assert.ok(out.items.length > 50);
  for (const i of out.items) {
    assert.ok(i.sources[0].url?.startsWith("https://www.openstreetmap.org/"));
    assert.ok(i.evidence.length > 0);
  }
  const tiers = new Set(out.items.filter((i) => i.brand === "Mercadona" || i.brand === "Lidl").map((i) => i.tier));
  assert.deepEqual([...tiers], [2]);
  assert.ok(out.notes.some((n) => n.step === "top-down" && /seed brands only/.test(n.message)));
  // Fixture has no edit dates, so chains without dates must not be called "real" by rule alone.
  assert.ok(out.items.some((i) => i.verdict === "unverified"));
});

// --- DeepSeek usage tracking ---------------------------------------------------

test("DeepSeek client records tokens, respects the call cap, parses fenced JSON", async () => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  const store = memoryUsageStore();
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ model: "deepseek-x", choices: [{ message: { content: '```json\n{"a":1}\n```' } }], usage: { prompt_tokens: 321, completion_tokens: 45 } }), { status: 200 })) as typeof fetch;
  const client = deepseekClient({ usage: createUsageGuard(store), store, fetchImpl });
  const r = await client.chatJson("s", "u");
  assert.deepEqual(r.json, { a: 1 });
  assert.equal(r.tokensIn, 321);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(store.counts.get(`deepseek|tokens-in|${day}`), 321);
  assert.equal(store.counts.get(`deepseek|tokens-out|${day}`), 45);
  assert.equal(store.counts.get(`deepseek|agent|${day}`), 1);

  process.env.CAP_DEEPSEEK_AGENT_DAILY = "1";
  await assert.rejects(client.chatJson("s", "u"), AiCappedError);
  delete process.env.CAP_DEEPSEEK_AGENT_DAILY;

  assert.deepEqual(parseJsonReply('Sure! {"b":2}'), { b: 2 });
});

test("DeepSeek balance: low-balance warning below the threshold", async () => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  const bal = (total: string, currency: string) =>
    (async () => new Response(JSON.stringify({ is_available: true, balance_infos: [{ currency, total_balance: total }] }), { status: 200 })) as typeof fetch;
  assert.equal((await deepseekBalance(bal("1.50", "USD"))).low, true);
  assert.equal((await deepseekBalance(bal("9.00", "USD"))).low, false);
  assert.equal((await deepseekBalance(bal("10.00", "CNY"))).low, true);
  const err = await deepseekBalance((async () => new Response("{}", { status: 401 })) as typeof fetch);
  assert.match(err.error!, /401/);
});
