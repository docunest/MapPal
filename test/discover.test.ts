// Discover mode: the agent names places; the server matches them to the
// OpenStreetMap index (real names around Caldas da Rainha) or keeps them as
// "not on the map" with a stable ext/ key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveriesIn } from "../lib/agent/application/discover";
import { discoverySchema, extRef, isPlaceKey, matchToIndex, nameSimilarity } from "../lib/agent/domain/discover";
import type { OsmThing } from "../lib/agent/domain/types";

const T = (ref: string, name: string, lat: number, lng: number, extra: Record<string, string> = {}): OsmThing => ({ ref, lat, lng, tags: { name, amenity: "cafe", ...extra } });
const INDEX = [
  T("node/1", "Café Bordalo", 39.40355, -9.13702),
  T("node/2", "Pastelaria Pituca", 39.4049, -9.1349),
  T("way/3", "Malaica Organic Brewery", 39.4012, -9.1401, { amenity: "bar" }),
  T("node/4", "Café Central", 39.4038, -9.1362),
  T("node/5", "Café Central", 39.36, -9.16),
];

test("names: accents, café/bar words and word order don't matter", () => {
  assert.equal(nameSimilarity("Cafe Bordalo", "Café Bordalo"), 1);
  assert.ok(nameSimilarity("Bordalo Café-Bar", "Café Bordalo") >= 0.9);
  assert.ok(nameSimilarity("Malaica", "Malaica Organic Brewery") >= 0.5 && nameSimilarity("Malaica", "Malaica Organic Brewery") < 0.8);
  assert.ok(nameSimilarity("Pastelaria Pituca", "Café Central") < 0.3);
});

test("match: the same place with a drifting pin; the right one of two same-named cafés", () => {
  const m = matchToIndex({ name: "Cafe Bordalo", lat: 39.4041, lng: -9.1375 }, INDEX);
  assert.equal(m?.osmRef, "node/1");
  assert.ok(m!.distanceM > 50 && m!.distanceM < 150);
  assert.equal(matchToIndex({ name: "Café Central", lat: 39.3601, lng: -9.1601 }, INDEX)?.osmRef, "node/5");
  assert.equal(matchToIndex({ name: "Malaica", lat: 39.4013, lng: -9.1402 }, INDEX)?.osmRef, "way/3");
});

test("match: osm_ref wins; unknown names or far pins stay off the map", () => {
  assert.equal(matchToIndex({ name: "whatever", lat: 0, lng: 0, osm_ref: "node/2" }, INDEX)?.how, "osm_ref");
  assert.equal(matchToIndex({ name: "Casa do Insta", lat: 39.4036, lng: -9.1386 }, INDEX), null);
  assert.equal(matchToIndex({ name: "Café Bordalo", lat: 39.43, lng: -9.137 }, INDEX), null); // 3 km off
  // A loose name only counts very close.
  assert.equal(matchToIndex({ name: "Pituca Bakery House", lat: 39.409, lng: -9.1349 }, INDEX), null);
});

test("ext keys: stable for the same place, accepted as a place key", () => {
  const a = extRef({ name: "Casa do Insta", lat: 39.40361, lng: -9.13862 });
  assert.equal(a, extRef({ name: "casa do insta", lat: 39.40358, lng: -9.13859 }));
  assert.notEqual(a, extRef({ name: "Casa do Insta", lat: 39.41, lng: -9.13862 }));
  assert.ok(isPlaceKey(a) && isPlaceKey("way/12") && !isPlaceKey("ext/zz") && !isPlaceKey("javascript:1"));
});

test("format: a Google-only place with a link is valid; a missing name or pin isn't", () => {
  const ok = { name: "Casa do Insta", lat: 39.4036, lng: -9.1386, google_maps_url: "https://maps.google.com/?cid=1", listed_on: ["google_maps", "instagram"], verdict: "real", confidence: 0.8, relevant: true, keep: true, score: 70, summary: "Small brunch place.", complications: [], evidence: [{ kind: "google", url: "https://maps.google.com/?cid=1", note: "open, recent reviews" }] };
  assert.ok(discoverySchema.safeParse(ok).success);
  assert.ok(!discoverySchema.safeParse({ ...ok, lat: undefined }).success);
  assert.ok(!discoverySchema.safeParse({ ...ok, name: "" }).success);
});

test("pasted answers: under their use case, flat lists for one use case, use_case fields", () => {
  const p = { name: "A", lat: 1, lng: 2 };
  assert.deepEqual([...discoveriesIn({ run_id: "r", discoveries: { cafes: [p], bars: [p, p] } }, ["cafes", "bars"])].map(([k, v]) => [k, v.length]), [["cafes", 1], ["bars", 2]]);
  assert.deepEqual([...discoveriesIn([p, p], ["cafes"])].map(([k, v]) => [k, v.length]), [["cafes", 2]]);
  assert.deepEqual([...discoveriesIn({ places: [{ ...p, use_case: "bars" }] }, ["cafes", "bars"])].map(([k]) => k), ["bars"]);
  assert.equal(discoveriesIn({ places: [p] }, ["cafes", "bars"]).size, 0); // which use case? unknown → nothing
});
