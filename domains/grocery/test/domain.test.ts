import { test } from "node:test";
import assert from "node:assert/strict";
import { autocomplete, fold, matchPhrase, stem, type CatalogItem } from "../domain/text";
import { parseLocal, extractQty } from "../domain/parse";
import { seedProducts } from "../domain/seed-data";

const catalog: CatalogItem[] = seedProducts().map((p, i) => ({ ...p, id: `p${i}` }));
const byName = (n: string) => catalog.find((c) => c.name === n)!;

test("fold strips Lithuanian diacritics", () => {
  assert.equal(fold("Kiaušiniai, ŠVIEŽI!"), "kiausiniai sviezi");
});

test("stem joins case forms", () => {
  assert.equal(stem("pieno"), stem("pienas"));
  assert.equal(stem(fold("kiaušinių")), stem(fold("kiaušiniai")));
  assert.equal(stem("duonos"), stem("duona"));
  assert.equal(stem("sviesto"), stem("sviestas"));
});

test("autocomplete: 'pi' → pienas first among frequent", () => {
  const cat = catalog.map((c) => (c.name === "pienas" ? { ...c, uses: 20 } : c));
  const r = autocomplete("pi", cat);
  assert.equal(r[0].item.name, "pienas");
});

test("autocomplete: frequency beats alphabet for 'm'", () => {
  const cat = catalog.map((c) => (c.name === "morkos" ? { ...c, uses: 12 } : c));
  assert.equal(autocomplete("m", cat)[0].item.name, "morkos");
});

test("autocomplete: English alias 'milk' finds pienas", () => {
  const r = autocomplete("milk", catalog);
  assert.equal(r[0].item.name, "pienas");
  assert.equal(r[0].via, "milk");
});

test("autocomplete: no diacritics 'kiaus' finds kiaušiniai", () => {
  assert.equal(autocomplete("kiaus", catalog)[0].item.name, "kiaušiniai");
});

test("matchPhrase handles inflection and extra words", () => {
  assert.equal(matchPhrase("pieno", catalog)?.item.name, "pienas");
  assert.equal(matchPhrase("kiaušinių", catalog)?.item.name, "kiaušiniai");
  assert.equal(matchPhrase("toilet paper", catalog)?.item.name, "tualetinis popierius");
  assert.equal(matchPhrase("portable heater", catalog)?.item.name, "nešiojamas šildytuvas");
});

test("extractQty", () => {
  assert.deepEqual(extractQty("du litrus pieno"), { qty: "2 l", rest: "pieno" });
  assert.deepEqual(extractQty("2kg bulviu"), { qty: "2 kg", rest: "bulviu" });
  assert.deepEqual(extractQty("6 kiausiniai"), { qty: "6", rest: "kiausiniai" });
});

test("parseLocal: dictated fridge sentence, all known → no AI needed", () => {
  const r = parseLocal("reikia pieno, duonos ir kiaušinių, du litrus kefyro ir baigėsi sviestas", catalog);
  assert.deepEqual(
    r.items.map((i) => [i.name, i.qty, i.isNew]),
    [
      ["pienas", null, false],
      ["duona", null, false],
      ["kiaušiniai", null, false],
      ["kefyras", "2 l", false],
      ["sviestas", null, false],
    ],
  );
  assert.equal(r.unsure.length, 0);
  assert.ok(r.looksLikeSpeech);
});

test("parseLocal: unknown thing is flagged for AI", () => {
  const r = parseLocal("milk, eggs and a dehumidifier", catalog);
  assert.deepEqual(r.items.slice(0, 2).map((i) => i.name), ["pienas", "kiaušiniai"]);
  assert.deepEqual(r.unsure, ["dehumidifier"]);
});

test("parseLocal: remove intent", () => {
  const r = parseLocal("pieno nebereikia", catalog);
  assert.equal(r.items[0].action, "remove");
  assert.equal(r.items[0].name, "pienas");
});

test("long-term item keeps its kind", () => {
  assert.equal(byName("nešiojamas šildytuvas").kind, "LONGTERM");
});

import { dueItems } from "../domain/suggest";
import { parseWithAi } from "../domain/ai";

test("dueItems: weekly milk, 8 days since → due; bought yesterday → not", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const d = (n: number) => new Date(now - n * 86_400_000);
  const milk = byName("pienas"), bread = byName("duona");
  const purchases = [
    { productId: milk.id, at: d(29) }, { productId: milk.id, at: d(22) }, { productId: milk.id, at: d(15) }, { productId: milk.id, at: d(8) },
    { productId: bread.id, at: d(4) }, { productId: bread.id, at: d(2) }, { productId: bread.id, at: d(1) },
  ];
  const r = dueItems(purchases, catalog, new Set(), [{ id: "pieno", sortOrder: 30 }, { id: "duona", sortOrder: 20 }], now);
  const names = r.suggestions.map((s) => s.name);
  assert.ok(names.includes("pienas"));
  assert.ok(!names.includes("duona"));
  assert.equal(r.suggestions.find((s) => s.name === "pienas")!.intervalDays, 7);
});

test("parseWithAi: validates ids and categories from a fake model", async () => {
  const milk = byName("pienas");
  const fake = async () => ({
    items: [
      { action: "add", productId: milk.id, name: "pienas", aliases: ["leche"], category: "pieno", kind: "GROCERY", qty: "2", heard: "dvi pakuotes pieno" },
      { action: "add", productId: null, name: "Oro sausintuvas", nameEn: "dehumidifier", category: "elektronika", kind: "LONGTERM", heard: "a dehumidifier" },
      { action: "add", productId: "made-up", name: "kiaušiniai", category: "nope", heard: "eggs" },
    ],
  });
  const cats = [{ id: "pieno", nameLt: "", nameEn: "", kind: "GROCERY" as const }, { id: "elektronika", nameLt: "", nameEn: "", kind: "LONGTERM" as const }];
  const r = await parseWithAi("…", { catalog, categories: cats, listNames: [] }, fake);
  assert.equal(r[0].productId, milk.id);
  assert.equal(r[0].qty, "2");
  assert.deepEqual([r[1].name, r[1].isNew, r[1].kind, r[1].categoryId], ["oro sausintuvas", true, "LONGTERM", "elektronika"]);
  assert.equal(r[2].productId, byName("kiaušiniai").id); // bad id → exact name match rescued it
});

test("parseLocal: run-on dictation without commas", () => {
  const r = parseLocal("reikia duonos ir kiaušinių du litrus kefyro baigėsi sviestas ir dar nešiojamo šildytuvo", catalog);
  assert.deepEqual(r.items.map((i) => [i.name, i.qty]), [
    ["duona", null], ["kiaušiniai", null], ["kefyras", "2 l"], ["sviestas", null], ["nešiojamas šildytuvas", null],
  ]);
  assert.equal(r.unsure.length, 0);
});

test("parseLocal: description word becomes a note, unknown keeps diacritics", () => {
  const r = parseLocal("šviežio pieno, šaldiklio maišelių", catalog);
  assert.equal(r.items[0].name, "pienas");
  assert.equal(r.items[0].note, "šviežio");
  assert.ok(r.unsure.includes("šviežio"));
  const r2 = parseLocal("šaldytuvo magnetas", catalog);
  assert.equal(r2.items[0].name, "šaldytuvo magnetas");
  assert.equal(r2.items[0].isNew, true);
});

test("parseLocal: English mixed in", () => {
  const r = parseLocal("2 kg potatoes toilet paper and some coffee", catalog);
  assert.deepEqual(r.items.map((i) => [i.name, i.qty]), [["bulvės", "2 kg"], ["tualetinis popierius", null], ["kava", null]]);
});

test("catalog v2: beef cuts are found, mince isn't confused with plain beef", () => {
  assert.equal(autocomplete("beef", catalog)[0].item.name, "jautiena");
  assert.ok(autocomplete("jaut", catalog).slice(0, 5).some((s) => s.item.name === "jautienos faršas"));
  assert.equal(matchPhrase("jautienos faršo", catalog)?.item.name, "jautienos faršas");
  assert.equal(matchPhrase("minced beef", catalog)?.item.name, "jautienos faršas");
  assert.equal(matchPhrase("merluza", catalog)?.item.name, "jūrų lydeka");
  const r = parseLocal("kilogramą jautienos faršo, sardinių ir chemijos tualetui", catalog);
  assert.deepEqual(r.items.map((i) => i.name), ["jautienos faršas", "sardinės", "chemija tualetui"]);
});
