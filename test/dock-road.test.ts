import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, cumulative, infoOf, layerOf, overpassQuery, placePois, project, simplify, type LatLng } from "../lib/dock/road";

// A straight-ish stretch of the A1 north of Lisbon (Vila Franca de Xira → Carregado), heading NE.
const A1: LatLng[] = [
  { lat: 38.9554, lng: -8.9894 },
  { lat: 38.9800, lng: -8.9650 },
  { lat: 39.0050, lng: -8.9400 },
  { lat: 39.0300, lng: -8.9150 },
];

test("projection: km along the route, distance off it, side in the driving direction", () => {
  const cum = cumulative(A1);
  assert.ok(Math.abs(cum[3] / 1000 - 10.4) < 0.5, `route length ${cum[3]}`);
  // A point just east (right of a north-east heading) of the middle.
  const right = project(A1, cum, { lat: 38.9925, lng: -8.9480 });
  assert.equal(right.side, "R");
  assert.ok(right.off < 600 && right.along > 4000 && right.along < 6500, JSON.stringify(right));
  const left = project(A1, cum, { lat: 38.9960, lng: -8.9560 });
  assert.equal(left.side, "L");
});

test("simplify keeps ends and drops points on a straight line", () => {
  const dense: LatLng[] = Array.from({ length: 50 }, (_, i) => ({ lat: 39 + i * 0.001, lng: -9 + i * 0.001 }));
  const s = simplify(dense, 25);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], dense[0]);
  assert.deepEqual(s[1], dense[49]);
});

test("chunks cover the route with shared joints", () => {
  const long: LatLng[] = Array.from({ length: 400 }, (_, i) => ({ lat: 38 + i * 0.005, lng: -9 }));
  const c = chunks(long, 60_000, 120);
  assert.ok(c.length >= 3);
  for (let i = 1; i < c.length; i++) assert.deepEqual(c[i][0], c[i - 1][c[i - 1].length - 1]);
});

test("OSM elements become layered POIs with facts", () => {
  assert.equal(layerOf({ amenity: "fuel", brand: "Galp" }), "fuel");
  assert.equal(layerOf({ highway: "services", name: "Área de Serviço de Aveiras" }), "rest");
  assert.equal(layerOf({ amenity: "sanitary_dump_station" }), "dump");
  assert.equal(layerOf({ highway: "primary", maxheight: "3.2" }), "limit");
  assert.equal(layerOf({ power: "plant", "plant:source": "wind" }), "power");
  assert.equal(layerOf({ highway: "motorway", name: "A1" }), null);
  assert.equal(infoOf("fuel", { "fuel:diesel": "yes", "fuel:lpg": "yes", "fuel:adblue": "yes", opening_hours: "24/7" }), "diesel ✓ · 24/7");
  assert.equal(infoOf("limit", { maxheight: "3.2" }), "height 3.2 m");
  const cum = cumulative(A1);
  const pois = placePois(
    [
      { type: "node", id: 1, lat: 38.9925, lon: -8.9480, tags: { amenity: "fuel", brand: "Galp", "fuel:diesel": "yes" } },
      { type: "way", id: 2, center: { lat: 38.9700, lon: -8.9760 }, tags: { highway: "services", name: "Área de Serviço" } },
      { type: "node", id: 3, lat: 38.80, lon: -9.30, tags: { amenity: "fuel" } }, // 40 km away: dropped
      { type: "node", id: 1, lat: 38.9925, lon: -8.9480, tags: { amenity: "fuel" } }, // duplicate
    ],
    A1,
    cum,
  );
  assert.deepEqual(pois.map((p) => [p.layer, p.side]), [["rest", pois[0].side], ["fuel", "R"]]);
  assert.ok(pois[0].km < pois[1].km);
});

test("one Overpass query per piece, each layer with its own corridor", () => {
  const q = overpassQuery(A1, ["fuel", "bridge"]);
  assert.match(q, /nwr\[amenity=fuel\]\(around:1000,38\.95540,-8\.98940,/);
  assert.match(q, /way\[bridge\]\[name\]\(around:60,/);
});

test("fuel: diesel only — no 'no diesel' or gas-only stations; untagged and LPG-noted ones stay", () => {
  assert.equal(layerOf({ amenity: "fuel" }), "fuel");
  assert.equal(layerOf({ amenity: "fuel", "fuel:diesel": "yes", "fuel:octane_95": "yes" }), "fuel");
  assert.equal(layerOf({ amenity: "fuel", "fuel:HGV_diesel": "yes" }), "fuel");
  assert.equal(layerOf({ amenity: "fuel", brand: "Repsol", "fuel:lpg": "yes" }), "fuel");
  assert.equal(layerOf({ amenity: "fuel", brand: "Dourogás", "fuel:cng": "yes", "fuel:lng": "yes" }), null);
  assert.equal(layerOf({ amenity: "fuel", "fuel:diesel": "no", "fuel:octane_95": "yes" }), null);
  assert.equal(layerOf({ amenity: "charging_station" }), null);
});

test("packs: corridor cells cover the route and its sides; rows placed with km, side, dedupe", async () => {
  const { corridorCells, placeRows } = await import("../lib/dock/packPois");
  const line: LatLng[] = [{ lat: 39.9, lng: -8.64 }, { lat: 40.2, lng: -8.43 }];
  const cells = corridorCells(line, 3000);
  assert.ok(cells.has("159_-35") && cells.has("160_-34"));
  const layers = ["fuel", "rest", "toilets", "water", "grocery", "dump", "aire"] as const;
  const rows = [
    { row: [0, 3_995_000, -861_000, "Galp", "Galp", "diesel ✓", "n1"] as [number, number, number, string | null, string | null, string | null, string], layers: [...layers] },
    { row: [0, 3_995_000, -861_000, "Galp", "Galp", "diesel ✓", "n1"] as [number, number, number, string | null, string | null, string | null, string], layers: [...layers] },
    { row: [6, 3_990_000, -800_000, "Far aire", null, null, "w2"] as [number, number, number, string | null, string | null, string | null, string], layers: [...layers] },
  ];
  const pois = placeRows(rows, new Set(["fuel", "aire"]), line, cumulative(line));
  assert.equal(pois.length, 1);
  assert.equal(pois[0].id, "node/1");
  assert.ok(pois[0].km > 5 && pois[0].km < 15 && pois[0].offsetM < 1000);
});
