// Car places up front on the phone: within 300 km or from the last 3 days —
// a 1500 km trip from Cantabria down to the Algarve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrow, isUpFront, town } from "../lib/dock/near";

const now = Date.parse("2026-11-07T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const sagres = { lat: 37.0089, lng: -8.9406 }; // where we are now
const place = (lat: number, lng: number, createdDaysAgo: number, extra: Record<string, unknown> = {}) => ({
  kind: "link",
  lat,
  lng,
  seenAt: daysAgo(createdDaysAgo),
  openedAt: null,
  createdAt: daysAgo(createdDaysAgo),
  ...extra,
});

test("near (Lagos, 30 km) is up front however old", () => {
  assert.equal(isUpFront(place(37.1028, -8.6730, 40), sagres, now), true);
});

test("far and old (Noja, ~900 km, 2 weeks) is history", () => {
  assert.equal(isUpFront(place(43.48, -3.526, 14), sagres, now), false);
});

test("far but sent yesterday (next destination: Madrid, ~560 km) is up front", () => {
  assert.equal(isUpFront(place(40.4168, -3.7038, 1), sagres, now), true);
});

test("driven to 2 days ago counts as recent even if sent long ago", () => {
  assert.equal(isUpFront(place(43.48, -3.526, 30, { openedAt: daysAgo(2) }), sagres, now), true);
});

test("pinned and not-yet-seen always", () => {
  assert.equal(isUpFront(place(43.48, -3.526, 30, { pinned: true }), sagres, now), true);
  assert.equal(isUpFront(place(43.48, -3.526, 30, { seenAt: null }), sagres, now), true);
});

test("unknown distance counts as far", () => {
  assert.equal(isUpFront(place(43.48, -3.526, 10), null, now), false);
  assert.equal(isUpFront({ ...place(0, 0, 10), lat: null, lng: null }, sagres, now), false);
});

test("arrow and town", () => {
  assert.equal(arrow(sagres, { lat: 43.48, lng: -3.526 }), "↗"); // Noja is north-east
  assert.equal(arrow(sagres, { lat: 37.0194, lng: -7.9304 }), "→"); // Faro due east
  assert.equal(town("Av. da República 12, 2450-101 Nazaré, Portugal"), "Nazaré");
  assert.equal(town("Av. de Ris, 39180 Noja, Cantabria, España"), "Noja");
  assert.equal(town("Av. de Ris, 39180 Noja, Cantabria, España", "Playa de Noja"), null);
});
