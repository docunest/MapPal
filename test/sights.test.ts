// Sightseeing on real data from Spain and Portugal: OSM extracts and
// Wikipedia geosearch responses captured at Matosinhos and Puerto de Sagunto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTags, classifyText } from "../lib/nearby/sightKinds";
import { mergeSightCandidates, rankSights } from "../lib/nearby/sights";
import { sightCandidatesFromElements } from "../lib/sources/osmSights";
import type { SightCandidate } from "../lib/sources/types";
import { distanceMeters } from "../lib/geo";
import { jsonFixture, osmFixture } from "./helpers";

const kindOf = (name: string | undefined, desc: string | undefined) => classifyText(name, desc)?.slug ?? null;

test("Iberian descriptions and names classify correctly (real Wikipedia strings)", () => {
  const cases: Array<[string | undefined, string | undefined, string | null]> = [
    // Puerto de Sagunto (ca/es)
    ["Central tèrmica de Sagunt", "Central termoelèctrica de cicle combinat", "power-plant"],
    ["Central térmica de Sagunto", undefined, "power-plant"],
    ["Port de Sagunt", "Nucli de població del municipi de Sagunt", null],
    ["Puerto de Sagunto", "Núcleo de población del municipio de Sagunto", null],
    ["Puerto de Sagunto (puerto)", "Recinto portuario situado en la ciudad de Sagunto", "port"],
    ["Platja del Port de Sagunt", "platja del País Valencià", null],
    ["Torre del Grau Vell", "bien de interés cultural", "tower"],
    ["Grau Vell", "barrio de Sagunto", null],
    // Matosinhos (pt/en)
    ["Leixões", "Portuguese seaport", "port"],
    ["Ponte móvel de Leça", undefined, "bridge"],
    ["Estação Ferroviária de Leixões", "estação ferroviária em Portugal", "railway-station"],
    ["Estação de Zoologia Marítima Dr. Augusto Nobre", undefined, null],
    ["Mercado Municipal de Matosinhos", undefined, "market"],
    ["Castro do Monte Castelo de Guifões", "castro no município de Matosinhos", "archaeology"],
    ["Leça Lighthouse", "Lighthouse in Portugal", "lighthouse"],
    ["Fort of São Francisco Xavier", "Fort in Porto, Portugal", "fort"],
    ["Estádio do Mar", "estádio de futebol em Matosinhos, Portugal", "stadium"],
    ["Pavilhão da Água", "Museu em Aldoar, Foz do Douro e Nevogilde, Portugal", "museum"],
    ["Matosinhos", "município de Portugal", null],
    ["Colégio Luso-Internacional do Porto", "escola privada no Porto, Portugal", null],
    ["Café Bela Cruz", "antigo café, restaurante e clube nocturno no Porto, em Portugal", null],
    ["Tidal pools of Leça de Palmeira", "Public swimming pool in Porto, Portugal", "landmark"],
    // Elsewhere in Iberia (seen in earlier probes)
    ["Estación de Avilés", "train station in Asturias", "railway-station"],
    ["Rio Torto (Douro)", "river tributary of Douro River in Viseu district", "river"],
    ["Estación de Servicio Cabrales", undefined, null],
  ];
  for (const [name, desc, want] of cases) assert.equal(kindOf(name, desc), want, `${name} — ${desc}`);
});

test("OSM tags: DocaPesca office is the fish auction, Ferrodisa is steelmaking", () => {
  const mat = osmFixture("matosinhos");
  const doca = mat.elements.find((e) => /docapesca/i.test(e.tags?.name ?? ""));
  assert.ok(doca, "DocaPesca present in the Matosinhos extract");
  assert.equal(classifyTags(doca!.tags!)?.slug, "fish-market");

  const sag = osmFixture("puerto-sagunto");
  const ferrodisa = sag.elements.find((e) => e.tags?.name === "Ferrodisa");
  assert.ok(ferrodisa);
  assert.equal(classifyTags(ferrodisa!.tags!)?.slug, "steelworks");
});

function wikiCandidates(file: string, center: { lat: number; lng: number }, lang: string): SightCandidate[] {
  const data = jsonFixture<{ query: { pages: Array<{ title: string; description?: string; coordinates?: Array<{ lat: number; lon: number }>; thumbnail?: { source: string }; pageprops?: { wikibase_item?: string } }> } }>(file);
  return data.query.pages
    .filter((p) => p.coordinates?.[0])
    .map((p) => {
      const c = { lat: p.coordinates![0].lat, lng: p.coordinates![0].lon };
      return {
        key: p.pageprops?.wikibase_item ?? `wp:${lang}:${p.title}`,
        source: "wikipedia" as const,
        name: p.title.replace(/ \([^)]*\)$/, ""),
        ...c,
        distance: distanceMeters(center, c),
        wikidata: p.pageprops?.wikibase_item,
        wiki: { lang, title: p.title },
        description: p.description,
        descriptionLang: lang,
        image: p.thumbnail?.source,
      };
    });
}

test("Matosinhos end to end: port, fish auction, lighthouse, bridge show up; towns and schools don't", () => {
  const fx = osmFixture("matosinhos");
  const candidates = [
    ...sightCandidatesFromElements(fx.center, fx.elements),
    ...wikiCandidates("wikipedia/matosinhos-pt.json", fx.center, "pt"),
    ...wikiCandidates("wikipedia/matosinhos-en.json", fx.center, "en"),
  ];
  const sights = rankSights(mergeSightCandidates(candidates), {}, { center: fx.center, radius: 2500, userLang: "en", localLangs: ["pt"] });
  const kinds = new Set(sights.map((s) => s.kind));
  for (const k of ["fish-market", "port", "railway-station", "bridge"]) assert.ok(kinds.has(k), `has ${k}: ${[...kinds].join(",")}`);
  const names = sights.map((s) => s.name);
  assert.ok(!names.includes("Matosinhos"), "the town itself is not a card");
  assert.ok(!names.some((n) => /Colégio/.test(n)), "schools are not cards");
  // Same thing from pt + en Wikipedia (shared Wikidata id) = one card, both sources.
  const seaLife = sights.filter((s) => s.wikidata === "Q1439061");
  assert.ok(seaLife.length <= 1);
  const fish = sights.find((s) => s.kind === "fish-market")!;
  assert.deepEqual(fish.sources.map((s) => s.source), ["osm"]);
});

test("Puerto de Sagunto: steelworks and power station found (OSM + Catalan Wikipedia)", () => {
  const fx = osmFixture("puerto-sagunto");
  const candidates = [
    ...sightCandidatesFromElements(fx.center, fx.elements),
    ...wikiCandidates("wikipedia/puerto-sagunto-ca.json", fx.center, "ca"),
  ];
  const sights = rankSights(mergeSightCandidates(candidates), {}, { center: fx.center, radius: 2500, userLang: "en", localLangs: ["es", "ca"] });
  const kinds = sights.map((s) => s.kind);
  assert.ok(kinds.includes("steelworks"), kinds.join(","));
  assert.ok(kinds.includes("power-plant"), kinds.join(","));
  assert.ok(!sights.some((s) => /Canet|Platja/.test(s.name)), "town and beach are not cards");
});

test("Wikidata enrichment gives the English name and fame, and is credited", () => {
  const fx = osmFixture("matosinhos");
  const candidates = wikiCandidates("wikipedia/matosinhos-pt.json", fx.center, "pt");
  const merged = mergeSightCandidates(candidates);
  const sights = rankSights(
    merged,
    { Q10351489: { label: "Leça Movable Bridge", fame: 1, wiki: [{ lang: "pt", title: "Ponte móvel de Leça" }] } },
    { center: fx.center, radius: 2500, userLang: "en", localLangs: ["pt"] },
  );
  const bridge = sights.find((s) => s.wikidata === "Q10351489")!;
  assert.equal(bridge.name, "Leça Movable Bridge");
  assert.equal(bridge.localName, "Ponte móvel de Leça");
  assert.deepEqual(bridge.sources.map((s) => s.source), ["wikipedia", "wikidata"]);
});
