import { test } from "node:test";
import assert from "node:assert/strict";
import { cellsAround, nearestRows, osmUrl, PACK_FILE, type PackRow } from "../lib/offline/packs";

const LAYERS = ["fuel", "rest", "toilets", "water", "grocery", "dump", "aire", "limit", "playground", "picnic", "beach",
  "works", "power", "quarry", "dam", "bridge", "airport", "castle", "viewpoint", "lighthouse"] as const;

test("cells: same 1/4° keys as the pack builder (floor, negative longitudes)", () => {
  // Pombal 39.915, -8.640 → floor(159.66)=159, floor(-34.56)=-35
  assert.ok(cellsAround(39.915, -8.64, 1000).includes("159_-35"));
  // 30 km covers neighbours on both sides
  const c = cellsAround(39.915, -8.64, 30_000);
  assert.ok(c.includes("158_-36") && c.includes("160_-34"));
  assert.ok(c.length <= 20);
});

test("nearest rows: right layer, within radius, nearest first, border duplicates once", () => {
  const rows: PackRow[] = [
    [0, 3_991_900, -863_600, "Galp", "Galp", "diesel ✓", "n1"],
    [0, 3_995_000, -865_000, null, "Repsol", null, "n2"],
    [0, 3_991_900, -863_600, "Galp", "Galp", "diesel ✓", "n1"], // same object from the other country's pack
    [6, 3_991_600, -864_100, "Stellplatz Pombal", null, "aire", "n3"],
    [0, 4_200_000, -864_000, "Far away", null, null, "n4"],
  ];
  const r = nearestRows(rows, [...LAYERS], "fuel", 39.915, -8.64, 30_000, 5);
  assert.deepEqual(r.map((p) => p.osm), ["n1", "n2"]);
  assert.ok(r[0].distM < r[1].distM && r[0].distM < 1000);
  assert.equal(nearestRows(rows, [...LAYERS], "aire", 39.915, -8.64, 30_000, 5)[0].name, "Stellplatz Pombal");
});

test("proxy passes only the manifest and web chunks", () => {
  assert.ok(PACK_FILE.test("poi-manifest.json"));
  assert.ok(PACK_FILE.test("poi-de-w12.json.gz"));
  assert.ok(!PACK_FILE.test("poi-de.sqlite.gz"));
  assert.ok(!PACK_FILE.test("dock.apk"));
  assert.ok(!PACK_FILE.test("../poi-manifest.json"));
});

test("osm links", () => {
  assert.equal(osmUrl("n123"), "https://www.openstreetmap.org/node/123");
  assert.equal(osmUrl("w5"), "https://www.openstreetmap.org/way/5");
  assert.equal(osmUrl("r7"), "https://www.openstreetmap.org/relation/7");
});
