// Shrink a captured fixture to what Nearby uses: utilities, plus anything
// that could be a sight (named landmark-ish features, or with a wiki link).
//   npx tsx scripts/trim-osm-fixture.ts test/fixtures/osm/*.json
import { readFileSync, writeFileSync } from "node:fs";
import { classifyUtility } from "../lib/nearby/utilityKinds";

const SIGHT_KEYS = /^(historic|man_made|natural|tourism|railway|power|industrial|waterway|aeroway|aerialway|craft|bridge:name)$/;

for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const before = data.elements.length;
  data.elements = data.elements.filter((e: { tags: Record<string, string> }) => {
    const t = e.tags;
    if (classifyUtility(t)) return true;
    if (t.wikidata || t.wikipedia) return true;
    if (!t.name) return t.man_made === "chimney" || t.natural === "cave_entrance" || t.tourism === "viewpoint";
    if (Object.keys(t).some((k) => SIGHT_KEYS.test(k))) return !(t.tourism && /^(hotel|guest_house|hostel|apartment|information)$/.test(t.tourism));
    return /^(marketplace|place_of_worship|theatre)$/.test(t.amenity ?? "") || /^(quarry|industrial)$/.test(t.landuse ?? "") || !!t.office;
  });
  writeFileSync(file, JSON.stringify(data));
  console.log(`${file}: ${before} → ${data.elements.length}`);
}
