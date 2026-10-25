// Capture a small, real OpenStreetMap extract around a point as a test
// fixture, in the same element shape Overpass returns (`out tags center`).
//
// Uses the main OSM API's /map call — fine for a handful of small boxes to
// build fixtures, NOT for the app itself (that's what Overpass is for).
//
//   npx tsx scripts/capture-osm-fixture.ts <name> <lat> <lng> [halfSizeDeg=0.006]
//
// Writes test/fixtures/osm/<name>.json. Data © OpenStreetMap contributors (ODbL).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [name, latArg, lngArg, halfArg] = process.argv.slice(2);
if (!name || !latArg || !lngArg) {
  console.error("usage: capture-osm-fixture.ts <name> <lat> <lng> [halfSizeDeg]");
  process.exit(1);
}
const lat = Number(latArg);
const lng = Number(lngArg);
const half = Number(halfArg ?? 0.006);
const lngHalf = half / Math.cos((lat * Math.PI) / 180);
const bbox = [lng - lngHalf, lat - half, lng + lngHalf, lat + half].map((n) => n.toFixed(5));

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function tagsOf(body: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const m of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) tags[decode(m[1])] = decode(m[2]);
  return tags;
}

async function main() {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox.join(",")}`;
  const res = await fetch(url, { headers: { "User-Agent": "MapPal/0.2 test fixtures (1lukas1@gmail.com)" } });
  if (!res.ok) throw new Error(`OSM API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const xml = await res.text();

  const coords = new Map<string, { lat: number; lon: number }>();
  const elements: Array<Record<string, unknown>> = [];

  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/node>)/g)) {
    const point = { lat: Number(m[2]), lon: Number(m[3]) };
    coords.set(m[1], point);
    const tags = m[5] ? tagsOf(m[5]) : {};
    if (Object.keys(tags).length) elements.push({ type: "node", id: Number(m[1]), ...point, tags });
  }

  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags = tagsOf(m[2]);
    if (!Object.keys(tags).length) continue;
    const pts = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((r) => coords.get(r[1])).filter((p) => !!p);
    if (!pts.length) continue;
    // Bounding-box middle, which is what Overpass's `center` is.
    const lats = pts.map((p) => p!.lat);
    const lons = pts.map((p) => p!.lon);
    const center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    };
    elements.push({ type: "way", id: Number(m[1]), center, tags });
  }

  // Keep the fixture small: buildings-only/roads-only elements aren't used by
  // Nearby; keep anything that could be a utility or a sight.
  const relevant = elements.filter((e) => {
    const t = e.tags as Record<string, string>;
    return Object.keys(t).some((k) =>
      /^(amenity|shop|office|tourism|historic|man_made|natural|waterway|railway|power|landuse|industrial|craft|leisure|aeroway|aerialway|wikidata|wikipedia|place|bridge:name)$/.test(k),
    ) && !(t.highway && !t.name && !t.wikidata);
  });

  const out = {
    _source: `OpenStreetMap API /map bbox=${bbox.join(",")}`,
    _license: "Data © OpenStreetMap contributors, ODbL 1.0",
    _captured: new Date().toISOString().slice(0, 10),
    center: { lat, lng },
    elements: relevant,
  };
  const dir = path.join(process.cwd(), "test/fixtures/osm");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(out));
  console.log(`${name}: ${relevant.length} elements (of ${elements.length} tagged) from ${(xml.length / 1e6).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
