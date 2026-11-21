// Hybrid agent Phase 0 (docs/PLAN.md → "Hybrid agent backend — Phase 0"):
// zone choice, cheap rules, caps and token counting, travel state, digests,
// review format, page/image parsing, agent tokens, MCP protocol. Real OSM
// data captured 2026-11-21 for Peniche and Arenas de Cabrales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CAPS, capsFromEnv, estimate, imageTokens, textTokens, wouldBreak } from "../lib/agent/domain/caps";
import { digestText } from "../lib/agent/domain/digest";
import { geohash, tilesForCircle } from "../lib/agent/domain/geohash";
import { pageText } from "../lib/agent/domain/html";
import { imageSize } from "../lib/agent/domain/image";
import { toThings } from "../lib/agent/domain/osm";
import { spread } from "../lib/agent/domain/plan";
import { CAFES, DEFAULT_RULES, FOOD } from "../lib/agent/domain/defaults";
import { condHolds, nodeSchema, profileSchema, runProfile, type Profile } from "../lib/agent/domain/profile";
import { chainOf, expand, resolveProfile, rootOf, selectsBelow, treeProblems, buildUseCaseTree } from "../lib/agent/domain/tree";
import { knownLayer, locationLayer, usecaseLayer } from "../lib/agent/domain/brief";
import { reviewsSchema } from "../lib/agent/domain/review";
import { coordsInLogLine, isHereLink, travelState, type Fix } from "../lib/agent/domain/travelState";
import { emptyCounters, type Candidate, type OsmThing } from "../lib/agent/domain/types";
import { pickZone } from "../lib/agent/domain/zone";
import { agentFromEnvToken, parseTokenList } from "../lib/agent/infrastructure/auth";
import { safeUrl } from "../lib/agent/infrastructure/web";
import { serveMcp, textResult, type McpServerDef } from "../lib/mcp/server";

// The default use-case tree, resolved (Food → Cafes… inherit area, page size, drop/score rules).
const defaultItems = DEFAULT_RULES.filter((r) => r.config).map((r) => ({ config: r.config! }));
const TREE = buildUseCaseTree(defaultItems);
const rules = (key: string) => resolveProfile(chainOf(TREE, key).map((e) => e.item));
const FOOD_KIDS = ["bars", "cafes", "fast-food", "restaurants"];

const fixture = (name: string, kind: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures/agent", `${name}--${kind}.json`), "utf8"));

// What get_briefs does before enrichment, on the captured data: zone → rules → negative list → page.
function planFor(name: string, known = new Set<string>()) {
  const z = fixture(name, "zone");
  const zone = pickZone({ ...z.arg, label: name, source: "fixture" }, toThings(z.elements));
  const cafes = toThings(fixture(name, "cafes").elements);
  const exploration = toThings(fixture(name, "explore").elements);
  const parkings = exploration.filter((t) => t.tags.amenity === "parking");
  const run = (p: Profile, things: typeof cafes) => {
    const r = runProfile(profileSchema.parse(p), things, zone, parkings);
    const fresh = r.candidates.filter((c) => !known.has(c.osmRef));
    const page = (p.spreadByTown ? spread(fresh, p.pageSize) : fresh.slice(0, p.pageSize)).map((c, i) => ({ ...c, id: `${p.idPrefix}${i + 1}` }));
    return { ...r, page, rest: fresh.length - page.length };
  };
  return { zone, cafes, exploration, c: run(rules("cafes"), cafes), b: run(rules("bars"), cafes), r: run(rules("restaurants"), cafes), f: run(rules("fast-food"), cafes), e: run(rules("exploration"), exploration) };
}

test("geohash matches the reference encoding", () => {
  assert.equal(geohash({ lat: 57.64911, lng: 10.40744 }, 11), "u4pruydqqvj");
  assert.equal(geohash({ lat: 39.3569, lng: -9.3787 }, 5), "eycrf");
  const tiles = tilesForCircle({ lat: 39.3569, lng: -9.3787, radiusM: 1500 });
  assert.ok(tiles.includes("eycrf") && tiles.length <= 6);
});

test("Peniche: zone = the camper aire by the target + Peniche, Ferrel, Serra d'El-Rei", () => {
  const { zone } = planFor("peniche");
  assert.equal(zone.campsite.kind, "camper aire");
  assert.ok(zone.campsite.distanceM < 500);
  assert.deepEqual(zone.towns.map((t) => t.name), ["Peniche", "Ferrel", "Serra d'El-Rei"]);
  assert.equal(zone.towns[0].radiusM, 1500);
  assert.match(zone.why, /nearest place to sleep/);
});

test("Arenas de Cabrales: a populous hamlet still counts as the main village", () => {
  const { zone } = planFor("arenas-de-cabrales");
  assert.equal(zone.towns[0].name, "Arenas de Cabrales");
  assert.equal(zone.towns[0].radiusM, 600);
  assert.equal(zone.campsite.name, "Aparcamiento de Autocaravanas");
});

test("no campsite nearby → the zone centres on the target and says so", () => {
  const zone = pickZone({ lat: 40, lng: -4, label: "field", source: "test" }, []);
  assert.equal(zone.campsite.kind, "target point");
  assert.match(zone.why, /No campsite/);
  assert.equal(zone.cafeCircles.length, 1);
});

test("food rules (as data) drop chains, fancy and unnamed places, with the reason; each sub-type picks its own kinds", () => {
  const { zone, c, b, r, f } = planFor("peniche");
  assert.ok(c.dropped.every((d) => d.reason));
  assert.ok(c.candidates.every((x) => x.kind === "cafe" || x.kind === "ice_cream"));
  assert.ok(b.candidates.every((x) => ["bar", "pub", "biergarten"].includes(x.kind)) && b.candidates.length > 0);
  assert.ok(r.candidates.every((x) => x.kind === "restaurant") && r.candidates.length > 0);
  assert.ok(f.candidates.every((x) => x.kind === "fast_food"));
  const fake: OsmThing[] = [
    { ref: "node/1", lat: 39.357, lng: -9.379, tags: { amenity: "cafe", name: "Starbucks", brand: "Starbucks" } },
    { ref: "node/2", lat: 39.357, lng: -9.379, tags: { amenity: "restaurant", name: "Restaurante Gastronómico Mar" } },
    { ref: "node/3", lat: 39.357, lng: -9.379, tags: { amenity: "bar" } },
    { ref: "node/4", lat: 39.357, lng: -9.379, tags: { amenity: "bar", name: "Tasca do Zé", opening_hours: "Mo-Su 08:00-24:00" } },
    { ref: "node/5", lat: 39.357, lng: -9.379, tags: { "disused:amenity": "cafe", amenity: "cafe", name: "Old" } },
  ];
  const all = ["cafes", "bars", "restaurants"].map((k) => runProfile(rules(k), fake, zone));
  assert.deepEqual(all.flatMap((x) => x.candidates.map((c) => c.name)), ["Tasca do Zé"]);
  assert.deepEqual(all.flatMap((x) => x.dropped.map((d) => d.reason.split(" (")[0])), ["chain", "marked closed on the map", "no name on the map", "fancy"]);
  assert.equal(all[0].dropped[0].reason, "chain (Starbucks)");
  // Fast food keeps chains (that's the point of it); the parent's rules still drop unnamed ones.
  const ff = runProfile(rules("fast-food"), [{ ref: "node/9", lat: 39.357, lng: -9.379, tags: { amenity: "fast_food", name: "McDonald's", brand: "McDonald's" } }, { ref: "node/10", lat: 39.357, lng: -9.379, tags: { amenity: "fast_food" } }], zone);
  assert.deepEqual(ff.candidates.map((x) => x.name), ["McDonald's"]);
  assert.equal(ff.dropped[0].reason, "no name on the map");
});

test("Peniche page 1: every food sub-type spread over the towns, 15 exploration spots", () => {
  const { c, b, r, f, e } = planFor("peniche");
  assert.equal(c.found + b.found + r.found + f.found, 128); // the old single "cafes" rule found the same 128
  for (const [x, prefix] of [[c, "c"], [b, "b"], [r, "r"]] as const) {
    assert.ok(x.page.length > 0 && x.page.length <= 25);
    assert.equal(x.page[0].id, `${prefix}1`);
  }
  for (const town of ["Peniche", "Ferrel"]) assert.ok(r.page.some((x) => x.circle === town), town);
  assert.equal(e.page.length, 15);
  assert.equal(e.page[0].name, "Gruta da Furninha");
  assert.ok(e.page.some((x) => /Forte|Fortaleza/.test(x.name)));
  assert.ok(e.dropped.some((d) => /access=private/.test(d.reason)));
  assert.ok(e.page[0].parking && e.page[0].parking.distanceM < 300);
});

test("deterministic: same rules + same places → same page in the same order, whatever the input order", () => {
  const a = planFor("peniche");
  const z = fixture("peniche", "zone");
  const zone = pickZone({ ...z.arg, label: "peniche", source: "fixture" }, toThings(z.elements));
  const shuffled = [...toThings(fixture("peniche", "cafes").elements)].reverse();
  const rr = runProfile(rules("restaurants"), shuffled, zone);
  assert.deepEqual(rr.candidates.map((x) => x.osmRef), a.r.candidates.map((x) => x.osmRef));
});

test("Arenas de Cabrales: caves near the village; exploration stays inside 15 km", () => {
  const { e, zone } = planFor("arenas-de-cabrales");
  assert.ok(e.page.filter((x) => x.kind === "cave").length >= 5);
  for (const x of e.page) assert.ok(Math.hypot((x.lat - zone.explore.lat) * 111, (x.lng - zone.explore.lng) * 81) < 15.5);
  assert.ok(e.dropped.some((d) => d.reason === "long-distance trail, not a spot"));
});

test("negative list: known places never come back; 'more' = the next places", () => {
  const first = planFor("peniche");
  const known = new Set(first.r.page.map((x) => x.osmRef));
  const second = planFor("peniche", known);
  assert.ok(!second.r.page.some((x) => known.has(x.osmRef)));
  assert.equal(second.r.page.length, Math.min(first.r.page.length, first.r.rest));
  assert.equal(second.r.rest, Math.max(0, first.r.rest - first.r.page.length));
});

test("brief layers: text and hashes depend only on their inputs", () => {
  const { zone } = planFor("peniche");
  const l1 = locationLayer(zone, "x ±1 km");
  assert.equal(locationLayer(zone, "x ±1 km").hash, l1.hash);
  assert.notEqual(locationLayer(zone, "y ±1 km").hash, l1.hash);
  const k1 = knownLayer([{ name: "A", osmRef: "node/2" }, { name: "B", osmRef: "node/1" }]);
  assert.equal(knownLayer([{ name: "B", osmRef: "node/1" }, { name: "A", osmRef: "node/2" }]).hash, k1.hash);
  assert.match(k1.text, /never return these \(2/);
  assert.match(usecaseLayer(rules("exploration"), [{ title: "Exploration", body: "x", version: 3, hash: "abc" }], { found: 10, dropped: { "fast food": 2 } }), /rules v3 · abc[\s\S]*2 fast food/);
  const nested = usecaseLayer(rules("bars"), [{ title: "Food", body: "Eat.", version: 2, hash: "f00" }, { title: "Cool bars", body: "Drink.", version: 1, hash: "ba5" }], { found: 3, dropped: {} });
  assert.match(nested, /Use case: Food › Cool bars \(rules v2 · f00 › v1 · ba5\)\nFood: Eat\.\nCool bars: Drink\./);
});

test("rule conditions: match / hasAny / missingAll / regex / kinds", () => {
  assert.ok(condHolds({ match: { amenity: ["cafe", "bar"] } }, { amenity: "bar" }));
  assert.ok(condHolds({ match: { name: "~^tasca" } }, { name: "Tasca do Zé" }));
  assert.ok(!condHolds({ hasAny: ["brand"] }, { name: "x" }));
  assert.ok(condHolds({ missingAll: ["wikidata"], noName: true }, { natural: "cave_entrance" }));
  assert.ok(!condHolds({ kinds: ["cave"] }, {}, "mine"));
  assert.ok(condHolds({ regex: { keys: ["cuisine"], pattern: "\\bfish\\b" } }, { cuisine: "fish;regional" }));
  assert.ok(profileSchema.safeParse(rules("cafes")).success && profileSchema.safeParse(rules("exploration")).success);
  assert.ok(!nodeSchema.safeParse({ ...CAFES, idPrefix: "Cafe1" }).success);
  assert.ok(!profileSchema.safeParse(CAFES).success, "a child alone isn't complete — it needs its parent's settings");
});

test("spread keeps every town's best three before filling by score", () => {
  const mk = (circle: string, score: number): Candidate => ({ id: "", category: "cafes", osmRef: `n/${circle}${score}`, name: `${circle}${score}`, kind: "cafe", lat: 0, lng: 0, score, why: [], near: "", tile: "", tags: {}, circle });
  const ranked = [...[9, 8, 7, 6, 5, 4].map((s) => mk("A", s)), mk("B", 1), mk("B", 0.5)].sort((a, b) => b.score - a.score);
  assert.deepEqual(spread(ranked, 5).map((c) => c.name), ["A9", "A8", "A7", "B1", "B0.5"]);
});

test("token counting: images by size after Claude's resize, text by length", () => {
  assert.equal(imageTokens(480, 360), 231);
  assert.equal(imageTokens(), 1600);
  assert.equal(imageTokens(4000, 3000), 1534);
  assert.equal(textTokens("x".repeat(400)), 100);
});

test("caps: a spend that would pass a cap names the cap", () => {
  const c = emptyCounters();
  c.tokens = 149_900;
  assert.equal(wouldBreak(c, DEFAULT_CAPS, { tokens: 200 }), "tokens");
  assert.equal(wouldBreak(c, DEFAULT_CAPS, { tokens: 50 }), null);
  c.pages = 15;
  assert.equal(wouldBreak(c, DEFAULT_CAPS, { pages: 1 }), "pages");
  assert.equal(capsFromEnv({ MAPPAL_AGENT_CAP_TOKENS: "80000", MAPPAL_AGENT_CAP_GOOGLE_DETAILS: "10" }).tokens, 80000);
  assert.equal(capsFromEnv({ MAPPAL_AGENT_CAP_GOOGLE_DETAILS: "10" }).googleDetails, 10);
});

test("preview estimate stays within the token cap and counts no Google without a key", () => {
  const e = estimate(40, 2, false, DEFAULT_CAPS);
  assert.equal(e.googleDetails, 0);
  assert.ok(e.servedTokens <= DEFAULT_CAPS.tokens);
  assert.equal(estimate(40, 2, true, { ...DEFAULT_CAPS, tokens: 10_000 }).servedTokens, 10_000);
});

const at = (h: number) => new Date(Date.UTC(2026, 10, 21, h));
const fix = (kind: Fix["kind"], label: string, lat: number, lng: number, h: number, extra: Partial<Fix> = {}): Fix => ({ kind, source: "test", label, lat, lng, at: at(h), ...extra });

test("travel state: a destination shared after the latest position is the next stop", () => {
  const s = travelState([fix("position", "Pombal", 39.915, -8.64, 8), fix("destination", "Peniche", 39.36, -9.38, 9)], at(10));
  assert.equal(s.target?.label, "Peniche");
  assert.match(s.why, /shared after that/);
});

test("travel state: no newer destination → stay around the position; planned stop due soon wins", () => {
  const old = fix("destination", "Porto", 41.15, -8.61, 2);
  const s = travelState([fix("position", "Peniche", 39.36, -9.38, 8), old], at(10));
  assert.equal(s.target?.label, "Peniche");
  const planned = fix("destination", "Óbidos", 39.36, -9.16, 1, { arriveOn: new Date(Date.UTC(2026, 10, 22)) });
  assert.equal(travelState([fix("position", "Peniche", 39.36, -9.38, 8), planned], at(10)).target?.label, "Óbidos");
  assert.equal(travelState([], at(10)).target, null);
});

test("head-unit GPS log lines and 'here I am' links are recognised", () => {
  assert.deepEqual(coordsInLogLine("fix lat=39.36123 lng=-9.38001 acc=5m"), { lat: 39.36123, lng: -9.38001 });
  assert.deepEqual(coordsInLogLine("GPS ok 43.30150,-4.81360 speed 0"), { lat: 43.3015, lng: -4.8136 });
  assert.equal(coordsInLogLine("satellites 7, hdop 1.2"), null);
  assert.equal(coordsInLogLine("0.0000,0.0000"), null);
  assert.ok(isHereLink("Dropped pin"));
  assert.ok(isHereLink("Minha localização"));
  assert.ok(!isHereLink("Café do Mercado"));
});

test("digest: every line says its source; Google lines only when Google answered", () => {
  const { c: cafesPage } = planFor("peniche");
  const c = { ...cafesPage.page[0] };
  const plain = digestText(c, { notes: ["website failed: HTTP 404"] });
  assert.match(plain, /^### c1 · /);
  assert.match(plain, /OSM: /);
  assert.doesNotMatch(plain, /Google/);
  assert.match(plain, /Photo: none found/);
  const g = digestText(c, {
    google: { id: "x", rating: 4.6, ratingCount: 312, priceLevel: "PRICE_LEVEL_INEXPENSIVE", flags: ["coffee"], reviews: [{ rating: 5, when: "2 months ago", text: "Great galão" }], hours: ["Monday: 8–20"] },
    photo: { source: "google" },
    notes: [],
  });
  assert.match(g, /Google: 4.6★ \(312\) · € · coffee/);
  assert.match(g, /Review 5★ \(2 months ago\): "Great galão"/);
  assert.ok(textTokens(g) < 500);
});

test("review format: ids from the run, bounded text, enums", () => {
  const ok = reviewsSchema.safeParse([{ candidate: "c3", verdict: "real", confidence: 0.8, relevant: true, keep: true, summary: "Small local bar.", vibe: "bar-style", evidence: [{ kind: "photo", note: "terrace with locals" }] }]);
  assert.ok(ok.success);
  // Any use case's prefix (c, b, r, f, e…); the pull itself rejects ids it didn't send.
  assert.ok(reviewsSchema.safeParse([{ candidate: "b12", verdict: "real", confidence: 0.8, relevant: true, keep: true, summary: "", evidence: [] }]).success);
  for (const bad of ["C1", "1x", "cafe1", "b"]) assert.ok(!reviewsSchema.safeParse([{ candidate: bad, verdict: "real", confidence: 0.8, relevant: true, keep: true, summary: "", evidence: [] }]).success, bad);
  assert.ok(!reviewsSchema.safeParse([{ candidate: "c1", verdict: "maybe", confidence: 2, relevant: true, keep: true, summary: "", evidence: [] }]).success);
});

test("image size from the first bytes (PNG, JPEG, GIF)", () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 1, 0xe0, 0, 0, 1, 0x68], 16); // 480 × 360
  assert.deepEqual(imageSize(png), { width: 480, height: 360 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x68, 0x01, 0xe0, 0x03]);
  assert.deepEqual(imageSize(jpeg), { width: 480, height: 360 });
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xe0, 0x01, 0x68, 0x01, 0, 0]);
  assert.deepEqual(imageSize(gif), { width: 480, height: 360 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
});

test("page text: scripts stripped, menu links and menu images found, og:image absolute", () => {
  const html = `<html><head><title>Tasca &amp; Petiscos</title><meta property="og:image" content="/img/front.jpg"><script>var x=1</script></head>
  <body><nav><a href="/carta.html">Carta</a> <a href="/contacto">Contacto</a></nav><p>Pizza margherita 8,50&nbsp;€</p>
  <img src="/logo.svg"><img src="menu-del-dia.jpg" alt="Menú del día"><style>p{}</style></body></html>`;
  const p = pageText(html, "https://tasca.example.es/");
  assert.equal(p.title, "Tasca & Petiscos");
  assert.equal(p.ogImage, "https://tasca.example.es/img/front.jpg");
  assert.deepEqual(p.menuLinks, ["https://tasca.example.es/carta.html"]);
  assert.equal(p.images[0].url, "https://tasca.example.es/menu-del-dia.jpg");
  assert.ok(p.images[0].menu);
  assert.match(p.text, /Pizza margherita 8,50 €/);
  assert.doesNotMatch(p.text, /var x/);
});

test("web fetches refuse internal addresses", () => {
  assert.throws(() => safeUrl("http://localhost:3000/"));
  assert.throws(() => safeUrl("http://169.254.169.254/latest"));
  assert.throws(() => safeUrl("file:///etc/passwd"));
  assert.equal(safeUrl("https://www.cm-peniche.pt/").hostname, "www.cm-peniche.pt");
});

test("agent tokens: only hashes in config, one name per token", () => {
  const hash = createHash("sha256").update("token-for-claude-xxxxxxxx").digest("hex");
  const env = { MAPPAL_AGENT_TOKENS: `claude:${hash},chatgpt:${"0".repeat(64)}` };
  assert.equal(agentFromEnvToken("token-for-claude-xxxxxxxx", env), "claude");
  assert.equal(agentFromEnvToken("wrong-token-xxxxxxxxxxxxx", env), null);
  assert.equal(agentFromEnvToken(undefined, env), null);
  assert.equal(agentFromEnvToken("token-for-claude-xxxxxxxx", { MAPPAL_AGENT_TOKENS: "" }), null);
  assert.equal(agentFromEnvToken("token-for-claude-xxxxxxxx", {}), null); // no built-in tokens any more
  assert.equal(parseTokenList("a:zz,b").length, 0);
});

test("MCP protocol (shared core): 401 without a token, initialize, tools/list, tools/call with images", async () => {
  const def: McpServerDef<string> = {
    info: { name: "t", title: "T", version: "1" },
    instructions: "hi",
    tools: [{ name: "echo", description: "echo", inputSchema: { type: "object" } }],
    call: async (_n, args, who) => ({ content: [{ type: "text", text: `${who}:${args.x}` }, { type: "image", data: "AAAA", mimeType: "image/png" }], isError: false }),
  };
  const post = (body: unknown) => new Request("https://x/api", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await serveMcp(post({}), def, null)).status, 401);
  const init = await (await serveMcp(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }), def, "claude")).json();
  assert.equal(init.result.serverInfo.name, "t");
  assert.equal(init.result.instructions, "hi");
  const list = await (await serveMcp(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }), def, "claude")).json();
  assert.equal(list.result.tools[0].name, "echo");
  const called = await (await serveMcp(post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { x: 7 } } }), def, "claude")).json();
  assert.equal(called.result.content[0].text, "claude:7");
  assert.equal(called.result.content[1].type, "image");
  const unknown = await (await serveMcp(post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }), def, "claude")).json();
  assert.equal(unknown.result.isError, true);
  assert.equal((await serveMcp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), def, "claude")).status, 202);
  assert.deepEqual(textResult("a").content, [{ type: "text", text: "a" }]);
});

test("exploration rules: spots ranked, private/unnamed/long-distance dropped, parking found", () => {
  const { zone } = planFor("arenas-de-cabrales");
  const p = { lat: zone.explore.lat + 0.01, lng: zone.explore.lng };
  const things: OsmThing[] = [
    { ref: "node/1", ...p, tags: { natural: "cave_entrance", name: "Cueva Test", wikidata: "Q1" } },
    { ref: "node/2", ...p, tags: { historic: "ruins", name: "Molino", access: "private" } },
    { ref: "relation/3", ...p, tags: { route: "hiking", name: "European long distance path E9", wikidata: "Q2" } },
    { ref: "node/4", ...p, tags: { tourism: "viewpoint" } },
    { ref: "node/6", lat: zone.explore.lat + 0.5, lng: zone.explore.lng, tags: { natural: "cave_entrance", name: "Far away" } },
  ];
  const parking: OsmThing[] = [{ ref: "node/5", lat: p.lat + 0.001, lng: p.lng, tags: { amenity: "parking", name: "Aparcamiento", fee: "no" } }];
  const r = runProfile(rules("exploration"), things, zone, parking);
  assert.deepEqual(r.candidates.map((c) => c.name), ["Cueva Test"]);
  assert.equal(r.candidates[0].parking?.name, "Aparcamiento");
  assert.ok(r.candidates[0].parking!.distanceM < 150);
  assert.deepEqual(r.dropped.map((d) => d.reason).sort(), ["access=private on the map", "long-distance trail, not a spot", "no name on the map"]);
});

// --- Location estimate, place-index cells (2026-11-21 evening) ---
import { estimateLocation } from "../lib/agent/domain/travelState";
import { cellBox, cellOf, cellsForCircle, layerOf, quarters } from "../lib/agent/domain/cells";
import { cellQuery } from "../lib/agent/domain/queries";

const hint = (source: string, label: string, lat: number, lng: number, hoursAgo: number): Fix => ({ kind: "position", source, label, lat, lng, at: new Date(at(12).getTime() - hoursAgo * 3_600_000) });

test("estimate: car GPS beats an older shared link; both near → combined, accuracy small", () => {
  const { estimate, hints } = estimateLocation(
    [hint("car GPS log (unit)", "gps", 39.4036, -9.1386, 0.5), hint("shared from a phone (iPhone)", "café", 39.405, -9.135, 3)],
    at(12),
  );
  assert.ok(estimate);
  assert.equal(estimate!.source, "car GPS log (unit)");
  assert.ok(estimate!.accuracyKm <= 8);
  assert.ok(hints.every((h) => h.used));
});

test("estimate: an impossible jump is an outlier, not the location", () => {
  const { estimate, hints } = estimateLocation(
    [hint("car GPS log (unit)", "Caldas", 39.4036, -9.1386, 2), hint("shared from a phone (iPhone)", "Madrid link", 40.4168, -3.7038, 1.5), hint("car GPS log (unit)", "Óbidos", 39.36, -9.157, 1)],
    at(12),
  );
  assert.match(hints.find((h) => h.label === "Madrid link")!.note, /outlier/);
  assert.ok(Math.abs(estimate!.lat - 39.36) < 0.05);
});

test("estimate: the owner's pin outranks everything; old hints fade and widen the circle", () => {
  const pinned = estimateLocation([hint("car GPS log (unit)", "gps", 39.40, -9.13, 1), hint("owner pin", "here", 39.36, -9.157, 1)], at(12)).estimate!;
  assert.equal(pinned.label, "here");
  const old = estimateLocation([hint("car GPS log (unit)", "gps", 39.40, -9.13, 30)], at(12)).estimate!;
  assert.ok(old.confidence < 0.2);
  assert.equal(old.accuracyKm, 60);
  assert.equal(estimateLocation([hint("car GPS log (unit)", "gps", 39.4, -9.13, 24 * 20)], at(12)).estimate, null);
});

test("place-index cells: geohash-4 boxes cover the circle, nearest first; quarters tile the box", () => {
  const c = { lat: 39.4036, lng: -9.1386 };
  const cells = cellsForCircle({ ...c, radiusM: 16_000 });
  assert.equal(cells[0], cellOf(c));
  assert.ok(cells.length >= 2 && cells.length <= 12, String(cells.length));
  const b = cellBox(cells[0]);
  assert.ok(b.s <= c.lat && c.lat <= b.n && b.w <= c.lng && c.lng <= b.e);
  const q = quarters(b);
  assert.equal(q.length, 4);
  assert.equal(q[0].s, b.s);
  assert.equal(q[3].e, b.e);
  const big = cellsForCircle({ ...c, radiusM: 100_000 });
  assert.ok(big.length > 20 && big.length < 120, String(big.length));
  assert.match(cellQuery(b), /\(39\.\d+,-\d+\.\d+,39\.\d+,-\d+\.\d+\)/);
});

test("place-index layers", () => {
  assert.equal(layerOf({ amenity: "cafe" }), "food");
  assert.equal(layerOf({ amenity: "parking" }), "parking");
  assert.equal(layerOf({ tourism: "caravan_site" }), "stay");
  assert.equal(layerOf({ place: "town" }), "town");
  assert.equal(layerOf({ natural: "cave_entrance" }), "explore");
});

// --- Nested use cases (2026-11-21 night) ---
test("use-case tree: Food is a group with four sub-types; Exploration stands alone", () => {
  // Depth first, siblings by title (Cafes, Cool bars, Fast food, Restaurants); * = group.
  assert.deepEqual(TREE.map((e) => `${e.depth}:${e.key}${e.runs ? "" : "*"}`), ["0:exploration", "0:food*", "1:cafes", "1:bars", "1:fast-food", "1:restaurants"]);
  assert.deepEqual(TREE.filter((e) => e.depth === 0).map((e) => e.key), ["exploration", "food"]);
  assert.deepEqual([...TREE.find((e) => e.key === "food")!.children].sort(), FOOD_KIDS);
  assert.deepEqual([...expand(TREE, ["food"])].sort(), ["food", ...FOOD_KIDS].sort());
  assert.deepEqual([...expand(TREE, ["bars", "old-thing"])], ["bars", "old-thing"]);
  assert.equal(rootOf(TREE, "bars"), "food");
});

test("a sub-type inherits what it leaves out; parent drop/score rules come first", () => {
  const bars = rules("bars");
  assert.equal(bars.area.kind, "towns");
  assert.equal(bars.pageSize, FOOD.pageSize);
  assert.equal(bars.idPrefix, "b");
  assert.equal(bars.drop[0].reason, "no name on the map");
  assert.ok(bars.drop.some((d) => d.reason.startsWith("chain")));
  assert.equal(bars.score[0].label, "hours mapped");
  assert.match(bars.criteria, /^Places to eat[\s\S]*\nWant: bar-style/);
  // A child can override: its own page size wins.
  const tree = buildUseCaseTree([...defaultItems, { config: { useCase: "tapas", title: "Tapas", parent: "bars", idPrefix: "t", pageSize: 5, select: [{ kind: "tapas", match: { cuisine: "~tapas" }, points: 1 }] } }]);
  const tapas = resolveProfile(chainOf(tree, "tapas").map((e) => e.item));
  assert.equal(tapas.pageSize, 5);
  assert.equal(tapas.area.kind, "towns");
  assert.equal(chainOf(tree, "tapas").map((e) => e.key).join(">"), "food>bars>tapas");
});

test("tree problems: unknown parent, loops, duplicate id prefix, nothing to inherit", () => {
  assert.deepEqual(treeProblems(defaultItems), []);
  const add = (config: Record<string, unknown>) => treeProblems([...defaultItems, { config }]);
  assert.match(add({ useCase: "kebab", title: "Kebab", parent: "fod", idPrefix: "k", select: [{ kind: "k", match: { cuisine: "kebab" }, points: 1 }] }).join(), /parent "fod" doesn't exist/);
  assert.match(add({ useCase: "kebab", title: "Kebab", parent: "food", idPrefix: "b", select: [{ kind: "k", match: { cuisine: "kebab" }, points: 1 }] }).join(), /id prefix "b" is already used by bars/);
  assert.match(add({ useCase: "kebab", title: "Kebab", idPrefix: "k", select: [{ kind: "k", match: { cuisine: "kebab" }, points: 1 }] }).join(), /kebab: .*layers.*set it here or on a parent/);
  const loop = treeProblems([{ config: { useCase: "a", title: "A", parent: "b" } }, { config: { useCase: "b", title: "B", parent: "a" } }]);
  assert.match(loop.join(), /loops back/);
});

// --- Manual run: the pasted answer ---
import { parseReply, resultsIn } from "../lib/agent/application/manual";

test("manual run: the JSON is found in a chat answer, whatever its shape", () => {
  const r = { candidate: "c1", verdict: "real", confidence: 0.8, relevant: true, keep: true, summary: "ok", evidence: [] };
  const fenced = `Here you go:\n\`\`\`json\n{"run_id": "run_20261121_abcdef12", "briefs": {"brf_20261121_00000001": [${JSON.stringify(r)}]}}\n\`\`\`\nHope it helps.`;
  const j = parseReply(fenced) as { run_id: string };
  assert.equal(j.run_id, "run_20261121_abcdef12");
  assert.deepEqual(resultsIn(j).map((x) => x.candidate), ["c1"]);
  // A bare list, brief objects, smart quotes from a phone keyboard.
  assert.deepEqual(resultsIn(parseReply(`[${JSON.stringify(r)}, ${JSON.stringify({ ...r, candidate: "b2" })}]`)).map((x) => x.candidate), ["c1", "b2"]);
  assert.deepEqual(resultsIn(parseReply(`[{"brief_id": "brf_x", "results": [${JSON.stringify(r)}]}]`)).length, 1);
  assert.equal(resultsIn(parseReply('{“candidate”: “e4”, “verdict”: “real”}'))[0].candidate, "e4");
  // Nested evidence objects with their own fields aren't mistaken for results.
  assert.equal(resultsIn({ briefs: { b: [{ ...r, evidence: [{ kind: "osm", note: "x" }] }] } }).length, 1);
  assert.throws(() => parseReply("sorry, I can't"), /Couldn't find JSON/);
});

test("a place goes to its most specific use case", () => {
  const items = [...defaultItems, { config: { useCase: "kebab", title: "Kebab", parent: "fast-food", idPrefix: "k", select: [{ kind: "kebab", match: { amenity: "fast_food", cuisine: "~kebab" }, points: 1 }] } }];
  const tree = buildUseCaseTree(items);
  const below = selectsBelow(tree, "fast-food");
  assert.equal(below.length, 1);
  assert.ok(below.some((s) => condHolds(s, { amenity: "fast_food", cuisine: "kebab;pizza" })));
  assert.ok(!below.some((s) => condHolds(s, { amenity: "fast_food", cuisine: "burger" })));
  assert.deepEqual(selectsBelow(tree, "food").length, 1 + ["cafes", "bars", "restaurants", "fast-food"].reduce((n, k) => n + rules(k).select.length, 0));
});
