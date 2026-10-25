// Utilities (fuel / restaurants / groceries) on real OpenStreetMap data
// captured around Spanish and Portuguese test points (test/fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_RULES, findUtilities, mergeUtilities } from "../lib/nearby/utilities";
import { utilityFromElement } from "../lib/sources/osm";
import { utilityFromPhoton } from "../lib/sources/photon";
import type { Source, UtilityCategory, UtilityPlace } from "../lib/sources/types";
import { SourceCappedError } from "../lib/sources/types";
import { createUsageGuard, memoryUsageStore } from "../lib/sources/usage";
import { IBERIAN_FIXTURES, jsonFixture, osmFixture, within } from "./helpers";

const ctx = { usage: createUsageGuard(memoryUsageStore()) };
const meta = (id: Source["meta"]["id"], extra: Partial<Source["meta"]> = {}): Source["meta"] => ({
  id,
  label: id,
  type: "places",
  cost: "free",
  ai: false,
  homepage: "",
  description: "",
  priority: 10,
  ...extra,
});

/** An "Overpass" that answers from a captured extract, honouring the radius. */
function fixtureOsm(name: string, calls: Array<Partial<Record<UtilityCategory, number>>> = []): Source {
  const fx = osmFixture(name);
  return {
    meta: meta("osm"),
    configured: () => true,
    async utilities(q) {
      calls.push({ ...q.radius });
      const out: UtilityPlace[] = [];
      for (const [cat, r] of Object.entries(q.radius) as Array<[UtilityCategory, number]>) {
        for (const el of within(fx.elements, q.center, r)) {
          const p = utilityFromElement(el);
          if (p && p.category === cat) out.push(p);
        }
      }
      return out;
    },
  };
}

test("every Iberian fixture yields restaurants and groceries, nearest first", async () => {
  for (const name of IBERIAN_FIXTURES) {
    const fx = osmFixture(name);
    const r = await findUtilities(fx.center, ["fuel", "restaurants", "groceries"], [fixtureOsm(name)], ctx);
    const count = (c: UtilityCategory) => r.places.filter((p) => p.category === c).length;
    assert.ok(count("restaurants") >= 3, `${name}: restaurants ${count("restaurants")}`);
    assert.ok(count("groceries") >= 3, `${name}: groceries ${count("groceries")}`);
    for (let i = 1; i < r.places.length; i++) assert.ok(r.places[i - 1].distance <= r.places[i].distance);
    for (const p of r.places) assert.deepEqual(p.sources.map((s) => s.source), ["osm"]);
  }
});

test("rural Arenas de Cabrales: no fuel nearby → search widens to 30 km", async () => {
  const calls: Array<Partial<Record<UtilityCategory, number>>> = [];
  const fx = osmFixture("arenas-de-cabrales");
  const r = await findUtilities(fx.center, ["fuel", "restaurants"], [fixtureOsm("arenas-de-cabrales", calls)], ctx);
  assert.equal(r.radius.fuel, CATEGORY_RULES.fuel.maxRadius);
  assert.equal(calls.length, 3, "three widening rounds");
  // Restaurants are plentiful in the village: no widening for them after round 1.
  assert.equal(calls[1].restaurants, undefined);
});

test("Overpass down → Photon (real response) answers instead, and the failure is reported", async () => {
  const brokenOsm: Source = {
    meta: meta("osm"),
    configured: () => true,
    async utilities() {
      throw new Error("Overpass 504");
    },
  };
  const photon: Source = {
    meta: meta("photon", { priority: 20, nearestFirst: true }),
    configured: () => true,
    async utilities(q) {
      return (Object.keys(q.radius) as UtilityCategory[]).flatMap((cat) =>
        jsonFixture<{ features: Parameters<typeof utilityFromPhoton>[0][] }>(`photon/arenas-de-cabrales-${cat}.json`)
          .features.map(utilityFromPhoton)
          .filter((p): p is UtilityPlace => !!p),
      );
    },
  };
  const r = await findUtilities({ lat: 43.3015, lng: -4.8136 }, ["fuel", "restaurants", "groceries"], [brokenOsm, photon], ctx);
  assert.deepEqual(r.notes.map((n) => [n.source, n.status]), [["osm", "failed"], ["photon", "ok"]]);
  const fuel = r.places.filter((p) => p.category === "fuel");
  assert.ok(fuel.length >= 4);
  assert.equal(fuel[0].name, "Estación de Servicio Cabrales");
  assert.ok(fuel[0].distance > 1000 && fuel[0].distance < 2000, `nearest fuel ${fuel[0].distance} m`);
  assert.ok(r.places.every((p) => p.sources[0].source === "photon"));
});

test("fuel badges come from real tags (diesel/LPG/24-7)", () => {
  const fx = osmFixture("madrid-lavapies");
  const fuel = fx.elements.map(utilityFromElement).filter((p) => p?.category === "fuel") as UtilityPlace[];
  assert.ok(fuel.length > 0);
  for (const p of fuel) assert.ok(p.name.length > 0);
  const tagged = fx.elements.filter((e) => e.tags?.amenity === "fuel" && e.tags["fuel:diesel"] === "yes");
  if (tagged.length) assert.ok(fuel.some((p) => p.badges.includes("Diesel")));
});

test("closed-for-good and unnamed shops never show", () => {
  assert.equal(utilityFromElement({ type: "node", id: 1, lat: 0, lon: 0, tags: { shop: "supermarket", name: "X", "disused:shop": "supermarket" } }), null);
  assert.equal(utilityFromElement({ type: "node", id: 2, lat: 0, lon: 0, tags: { amenity: "restaurant" } }), null);
  assert.ok(utilityFromElement({ type: "node", id: 3, lat: 0, lon: 0, tags: { amenity: "fuel", brand: "Repsol" } }));
});

test("the same place from two sources merges into one, keeping both source tags", () => {
  const osm: UtilityPlace = {
    key: "osm:node/1", category: "fuel", kind: "fuel", kindLabel: "Fuel station", icon: "⛽", name: "Repsol Arenas",
    lat: 43.3, lng: -4.8, openingHours: "24/7", badges: ["Diesel"], sources: [{ source: "osm" }], refs: { osm: "node/1" },
  };
  const google: UtilityPlace = {
    ...osm, key: "google:abc", lat: 43.3004, openingHours: undefined, badges: [], sources: [{ source: "google" }], refs: { google: "abc" },
  };
  const merged = mergeUtilities([[osm], [google]]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sources.map((s) => s.source), ["osm", "google"]);
  assert.deepEqual(merged[0].refs, { osm: "node/1", google: "abc" });
  assert.equal(merged[0].openingHours, "24/7");
});

test("a capped paid source is reported as capped, free results still returned", async () => {
  const fx = osmFixture("arenas-de-cabrales");
  const google: Source = {
    meta: meta("google", { cost: "paid", priority: 90, nearestFirst: true }),
    configured: () => true,
    async utilities() {
      throw new SourceCappedError("Google daily limit reached");
    },
  };
  const r = await findUtilities(fx.center, ["fuel", "restaurants"], [fixtureOsm("arenas-de-cabrales"), google], ctx);
  assert.equal(r.notes.find((n) => n.source === "google")?.status, "capped");
  assert.ok(r.places.length > 0);
});
