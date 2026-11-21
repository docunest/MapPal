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
import { cafeRules } from "../lib/agent/domain/cafeRules";
import { digestText } from "../lib/agent/domain/digest";
import { exploreRules } from "../lib/agent/domain/exploreRules";
import { geohash, tilesForCircle } from "../lib/agent/domain/geohash";
import { pageText } from "../lib/agent/domain/html";
import { imageSize } from "../lib/agent/domain/image";
import { toThings } from "../lib/agent/domain/osm";
import { buildPlan, planText, spread } from "../lib/agent/domain/plan";
import { reviewsSchema } from "../lib/agent/domain/review";
import { coordsInLogLine, isHereLink, travelState, type Fix } from "../lib/agent/domain/travelState";
import { emptyCounters, type Candidate, type OsmThing } from "../lib/agent/domain/types";
import { pickZone } from "../lib/agent/domain/zone";
import { agentFromToken, parseTokenList } from "../lib/agent/infrastructure/auth";
import { safeUrl } from "../lib/agent/infrastructure/web";
import { serveMcp, textResult, type McpServerDef } from "../lib/mcp/server";

const fixture = (name: string, kind: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures/agent", `${name}--${kind}.json`), "utf8"));

function planFor(name: string, google = true) {
  const z = fixture(name, "zone");
  const zone = pickZone({ ...z.arg, label: name, source: "fixture" }, toThings(z.elements));
  const cafes = toThings(fixture(name, "cafes").elements);
  const exploration = toThings(fixture(name, "explore").elements);
  return { zone, cafes, exploration, plan: buildPlan(zone, { cafes: { things: cafes }, exploration: { things: exploration } }, new Set(), DEFAULT_CAPS, google) };
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

test("cafe rules drop fast food, chains, fancy and unnamed places, with the reason", () => {
  const { zone, cafes } = planFor("peniche");
  const r = cafeRules(cafes, zone);
  assert.ok(r.dropped.some((d) => d.reason === "fast food"));
  assert.ok(r.dropped.every((d) => d.reason));
  assert.ok(!r.candidates.some((c) => c.kind === "fast_food"));
  const fake: OsmThing[] = [
    { ref: "node/1", lat: 39.357, lng: -9.379, tags: { amenity: "cafe", name: "Starbucks", brand: "Starbucks" } },
    { ref: "node/2", lat: 39.357, lng: -9.379, tags: { amenity: "restaurant", name: "Restaurante Gastronómico Mar" } },
    { ref: "node/3", lat: 39.357, lng: -9.379, tags: { amenity: "bar" } },
    { ref: "node/4", lat: 39.357, lng: -9.379, tags: { amenity: "bar", name: "Tasca do Zé", opening_hours: "Mo-Su 08:00-24:00" } },
    { ref: "node/5", lat: 39.357, lng: -9.379, tags: { "disused:amenity": "cafe", amenity: "cafe", name: "Old" } },
  ];
  const f = cafeRules(fake, zone);
  assert.deepEqual(f.candidates.map((c) => c.name), ["Tasca do Zé"]);
  assert.deepEqual(f.dropped.map((d) => d.reason.split(" (")[0]), ["chain", "fancy", "no name on the map", "marked closed on the map"]);
});

test("Peniche dry run: 25 cafes spread over every town, 15 exploration spots, nothing spent", () => {
  const { plan } = planFor("peniche");
  const c = plan.categories.cafes;
  assert.equal(c.found, 128);
  assert.equal(c.candidates.length, 25);
  for (const town of ["Peniche", "Ferrel", "Serra d'El-Rei"]) assert.ok(c.candidates.some((x) => x.circle === town), town);
  assert.deepEqual(c.candidates.map((x) => x.id).slice(0, 3), ["c1", "c2", "c3"]);
  const e = plan.categories.exploration;
  assert.equal(e.candidates.length, 15);
  assert.equal(e.candidates[0].name, "Gruta da Furninha");
  assert.ok(e.candidates.some((x) => /Forte|Fortaleza/.test(x.name)));
  assert.ok(e.dropped.some((d) => /access=private/.test(d.reason)));
  assert.ok(plan.estimate.servedTokens <= DEFAULT_CAPS.tokens);
  const text = planText("run1", plan, DEFAULT_CAPS);
  assert.match(text, /DRY RUN, nothing spent yet/);
  assert.match(text, /wait for a yes/);
});

test("Arenas de Cabrales: caves near the village; exploration stays inside 15 km", () => {
  const { plan, zone } = planFor("arenas-de-cabrales", false);
  const e = plan.categories.exploration.candidates;
  assert.ok(e.filter((x) => x.kind === "cave").length >= 5);
  for (const x of e) assert.ok(Math.hypot((x.lat - zone.explore.lat) * 111, (x.lng - zone.explore.lng) * 81) < 15.5);
  assert.match(plan.notes.join(" "), /No Google key/);
});

test("places reviewed in the last 30 days are not checked again (cache)", () => {
  const { zone, cafes, exploration, plan } = planFor("peniche");
  const first = plan.categories.cafes.candidates[0];
  const again = buildPlan(zone, { cafes: { things: cafes }, exploration: { things: exploration } }, new Set([first.osmRef]), DEFAULT_CAPS, true);
  assert.ok(again.categories.cafes.cached.includes(first.name));
  assert.ok(!again.categories.cafes.candidates.some((c) => c.osmRef === first.osmRef));
});

test("a failed OSM query is reported, not shown as an empty area", () => {
  const { zone } = planFor("peniche");
  const p = buildPlan(zone, { cafes: { things: [], failed: "Overpass 504" }, exploration: { things: [] } }, new Set(), DEFAULT_CAPS, true);
  assert.match(p.notes.join(" "), /cafes: OpenStreetMap query failed \(Overpass 504\)/);
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

test("estimate stays within the token cap and counts no Google without a key", () => {
  const e = estimate({ cafes: 25, exploration: 15 }, false, DEFAULT_CAPS);
  assert.equal(e.googleDetails, 0);
  assert.ok(e.servedTokens <= DEFAULT_CAPS.tokens);
  const small = estimate({ cafes: 25, exploration: 15 }, true, { ...DEFAULT_CAPS, tokens: 10_000 });
  assert.equal(small.servedTokens, 10_000);
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
  const { plan } = planFor("peniche");
  const c = { ...plan.categories.cafes.candidates[0] };
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
  assert.ok(!reviewsSchema.safeParse([{ candidate: "x1", verdict: "real", confidence: 0.8, relevant: true, keep: true, summary: "", evidence: [] }]).success);
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
  assert.equal(agentFromToken("token-for-claude-xxxxxxxx", env), "claude");
  assert.equal(agentFromToken("wrong-token-xxxxxxxxxxxxx", env), null);
  assert.equal(agentFromToken(undefined, env), null);
  assert.equal(agentFromToken("token-for-claude-xxxxxxxx", { MAPPAL_AGENT_TOKENS: "" }), null);
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
    { ref: "node/5", lat: p.lat + 0.001, lng: p.lng, tags: { amenity: "parking", name: "Aparcamiento", fee: "no" } },
    { ref: "node/6", lat: zone.explore.lat + 0.5, lng: zone.explore.lng, tags: { natural: "cave_entrance", name: "Far away" } },
  ];
  const r = exploreRules(things, zone);
  assert.deepEqual(r.candidates.map((c) => c.name), ["Cueva Test"]);
  assert.equal(r.candidates[0].parking?.name, "Aparcamiento");
  assert.ok(r.candidates[0].parking!.distanceM < 150);
  assert.deepEqual(r.dropped.map((d) => d.reason), ["access=private on the map", "long-distance trail, not a spot", "no name on the map"]);
});
