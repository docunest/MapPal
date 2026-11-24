import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { travelState, type Fix } from "../lib/agent/domain/travelState";
import { homeOf, isPositionToken } from "../lib/position";

const now = new Date("2026-11-24T22:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const car = (lat: number, lng: number, h: number): Fix => ({ kind: "position", source: "car (Road ahead request)", label: `${lat}, ${lng}`, lat, lng, at: hoursAgo(h) });

test("home is the newest strong fix near Óbidos, not the weighted centre", () => {
  const s = travelState([car(39.43099, -9.20095, 3), car(39.42573, -9.16209, 3.3), car(39.40118, -9.13706, 3.5), car(39.3596, -9.1569, 55)], now);
  const home = homeOf(s)!;
  assert.equal(home.lat, 39.43099);
  assert.equal(home.lng, -9.20095);
  assert.equal(home.accuracyM, 100);
  assert.notEqual(home.lat, Math.round(s.estimate!.lat * 1e6) / 1e6);
});

test("a fresh owner pin outranks the car; the same weights as the travel estimate", () => {
  const pin: Fix = { kind: "position", source: "owner pin", label: "camp", lat: 39.4321, lng: -9.1999, at: hoursAgo(1) };
  const home = homeOf(travelState([car(39.43099, -9.20095, 1.5), pin], now))!;
  assert.equal(home.source, "owner pin");
  assert.equal(home.accuracyM, 200);
});

test("no fixes, no home", () => {
  assert.equal(homeOf(travelState([], now)), null);
});

test("token: only the hash is known; env value replaces it", () => {
  assert.equal(isPositionToken(undefined, {}), false);
  assert.equal(isPositionToken("wrong", {}), false);
  assert.equal(isPositionToken("abc", { POSITION_TOKEN: "abc" }), true);
  assert.equal(isPositionToken("abcd", { POSITION_TOKEN: "abc" }), false);
  assert.equal(createHash("sha256").update("x").digest("hex").length, 64);
});
