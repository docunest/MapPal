// Review app (/review): the scope filter (area, kind, pool, per-person votes),
// photos from older runs, been-there / sent-to-car marks, tile boxes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScope, markTravel, photoFrom } from "../lib/review/domain/filter";
import { geohashBox } from "../lib/review/domain/geohashBox";
import type { ReviewPlace, Scope } from "../lib/review/domain/types";
import { geohash } from "../lib/agent/domain/geohash";

const place = (key: string, lat: number, lng: number, extra: Partial<ReviewPlace> = {}): ReviewPlace => ({
  key, name: key, category: "cafes", kind: "cafe", lat, lng, checked: true, tags: {},
  agent: { verdict: "real", confidence: 0.8, keep: true, relevant: true, summary: "", evidence: [], reviewedAt: "", runId: "r" },
  votes: {}, ...extra,
});
const scope = (s: Partial<Scope> = {}): Scope => ({ lat: 39.4036, lng: -9.1386, radiusKm: 20, categories: [], pool: "checked", voter: "Lukas", mine: "unvoted", ...s });

const caldas = place("node/1", 39.405, -9.135);
const obidos = place("node/2", 39.36, -9.157, { votes: { Agnes: "like" } });
const peniche = place("node/3", 39.356, -9.379); // ~21 km away
const notKept = place("node/4", 39.41, -9.13, { agent: { ...caldas.agent!, keep: false } });
const unchecked = place("node/5", 39.4, -9.14, { checked: false, agent: undefined });
const cave = place("node/6", 39.30, -9.20, { category: "exploration", kind: "cave", votes: { Lukas: "like" } });
const all = [peniche, obidos, caldas, notKept, unchecked, cave];

test("nearest first, inside the radius, agent picks by default", () => {
  assert.deepEqual(applyScope(all, scope()).map((p) => p.key), ["node/1", "node/2"]);
  const r = applyScope(all, scope())[0];
  assert.ok(r.distanceM! < 500 && r.bearing !== undefined);
});

test("wider nets: + ones the agent didn't pick, then everything found", () => {
  assert.deepEqual(applyScope(all, scope({ pool: "checked-all" })).map((p) => p.key), ["node/1", "node/4", "node/2"]);
  assert.deepEqual(applyScope(all, scope({ pool: "everything" })).map((p) => p.key), ["node/1", "node/5", "node/4", "node/2"]);
  assert.equal(applyScope(all, scope({ radiusKm: null, pool: "everything", mine: "any" })).length, 6);
});

test("per-person votes: my unvoted, my likes, and what Agnes liked that I haven't seen", () => {
  assert.deepEqual(applyScope(all, scope({ radiusKm: 50, mine: "like" })).map((p) => p.key), ["node/6"]);
  assert.ok(!applyScope(all, scope({ radiusKm: 50 })).some((p) => p.key === "node/6"));
  assert.deepEqual(applyScope(all, scope({ other: { voter: "Agnes", status: "like" } })).map((p) => p.key), ["node/2"]);
  assert.deepEqual(applyScope(all, scope({ voter: "Agnes", other: { voter: "Lukas", status: "unvoted" } })).map((p) => p.key), ["node/1"]);
});

test("kind filter", () => {
  assert.deepEqual(applyScope(all, scope({ radiusKm: 50, categories: ["exploration"], mine: "any" })).map((p) => p.key), ["node/6"]);
});

test("photos: never Google; Commons file pages become thumbnails", () => {
  assert.equal(photoFrom({ source: "google" }), undefined);
  assert.equal(photoFrom({ source: "commons", page: "https://commons.wikimedia.org/wiki/File:Furninha.jpg" })?.url, "https://commons.wikimedia.org/wiki/Special:FilePath/Furninha.jpg?width=640");
  assert.equal(photoFrom({ source: "website", url: "https://x.pt/a.jpg" })?.url, "https://x.pt/a.jpg");
  assert.equal(photoFrom({ source: "website", page: "https://x.pt/" }), undefined);
});

test("been there (GPS within 75 m) and sent to the car", () => {
  const ps = [place("node/1", 39.405, -9.135), place("node/2", 39.36, -9.157)];
  markTravel(ps, [{ lat: 39.4054, lng: -9.1351, at: new Date("2026-11-10") }, { lat: 39.37, lng: -9.157, at: new Date("2026-11-11") }], [{ lat: 39.36, lng: -9.1571, at: new Date("2026-11-12") }]);
  assert.equal(ps[0].visitedAt, "2026-11-10T00:00:00.000Z");
  assert.equal(ps[0].sentAt, undefined);
  assert.equal(ps[1].visitedAt, undefined); // 1.1 km away doesn't count
  assert.equal(ps[1].sentAt, "2026-11-12T00:00:00.000Z");
});

test("geohash box contains its point", () => {
  const p = { lat: 39.4036, lng: -9.1386 };
  const b = geohashBox(geohash(p, 5));
  assert.ok(b.s <= p.lat && p.lat <= b.n && b.w <= p.lng && p.lng <= b.e);
  assert.ok(b.n - b.s < 0.05);
});
