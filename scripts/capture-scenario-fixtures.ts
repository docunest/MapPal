// Captures real OpenStreetMap data for the scenario acceptance points
// (docs/PLAN.md) into test/fixtures/scenarios/, using the scenarios' seed
// brand lists (no AI), so tests and evidence runs use real Iberian data.
//
//   NODE_USE_ENV_PROXY=1 npx tsx scripts/capture-scenario-fixtures.ts [point-slug ...]
//
// Only the tags the pipeline reads are kept, to keep fixtures small.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { OVERPASS_ENDPOINTS, overpassQuery, type OverpassElement } from "../lib/overpass";
import { buildBottomUpQuery } from "../lib/scenarios/bottomUp";
import { ACCEPTANCE_POINTS, DEFAULT_SCENARIOS } from "../lib/scenarios/defaults";
import { seedPlan } from "../lib/scenarios/topDown";

const KEEP = /^(name|brand|operator|shop|amenity|craft|trade|opening_hours|website|contact:website|phone|contact:phone|check_date.*|survey:date|source:date|addr:street|addr:housenumber|addr:city|addr:place|access|description|(disused|abandoned|was|demolished|removed):(amenity|shop))$/;
const RADIUS_KM = 15;
const dir = path.join(__dirname, "..", "test", "fixtures", "scenarios");

function slim(el: OverpassElement & { timestamp?: string }) {
  const tags = Object.fromEntries(Object.entries(el.tags ?? {}).filter(([k]) => KEEP.test(k)));
  return { type: el.type, id: el.id, lat: el.lat, lon: el.lon, center: el.center, timestamp: el.timestamp, tags };
}

async function main() {
  mkdirSync(dir, { recursive: true });
  const only = process.argv.slice(2);
  // OVERPASS_MIRROR=<url> limits the capture to one mirror (some are
  // unreachable from sandboxes; an overloaded one answers 504 fast, so many
  // quick retries beat waiting on dead ones).
  const mirrors = process.env.OVERPASS_MIRROR ? [process.env.OVERPASS_MIRROR] : [...OVERPASS_ENDPOINTS];
  for (const p of ACCEPTANCE_POINTS) {
    if (only.length && !only.includes(p.slug)) continue;
    for (const s of DEFAULT_SCENARIOS) {
      const file = path.join(dir, `${p.slug}--${s.slug}.json`);
      if (existsSync(file) && !process.env.FORCE) continue;
      const plan = seedPlan(s.config, p.country);
      const query = buildBottomUpQuery(p, RADIUS_KM * 1000, s.config, plan);
      let elements: OverpassElement[] | null = null;
      for (let attempt = 0; attempt < 40 && !elements; attempt++) {
        try {
          OVERPASS_ENDPOINTS.splice(0, OVERPASS_ENDPOINTS.length, ...mirrors);
          elements = await overpassQuery(query, { timeoutMs: 90000 });
        } catch (err) {
          console.error(`${p.slug}/${s.slug} attempt ${attempt + 1}: ${(err as Error).message.slice(0, 120)}`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!elements) {
        console.error(`FAILED ${p.slug}/${s.slug}`);
        continue;
      }
      const fixture = {
        point: p,
        scenario: s.slug,
        radiusKm: RADIUS_KM,
        capturedAt: new Date().toISOString(),
        source: "OpenStreetMap via Overpass (© OpenStreetMap contributors, ODbL)",
        elements: elements.map(slim),
      };
      writeFileSync(file, JSON.stringify(fixture));
      console.log(`${p.slug}/${s.slug}: ${elements.length} elements`);
    }
  }
}

main();
