// Car-place photos: a Wikipedia picture only when the article is that place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wikiMatch, words } from "../lib/dock/photo";
import type { WikiGeoPage } from "../lib/wikimedia";

const page = (title: string, distance: number, thumbnail = "https://upload.wikimedia.org/x.jpg"): WikiGeoPage => ({
  lang: "es",
  title,
  lat: 0,
  lng: 0,
  distance,
  thumbnail,
});

test("words drop accents and the kind of place", () => {
  assert.deepEqual(words("Praia da Nazaré"), ["nazare"]);
  assert.deepEqual(words("Playa de las Catedrales"), ["catedrales"]);
  assert.deepEqual(words("Café Correeiro"), ["correeiro"]);
});

test("the article that is the place", () => {
  const got = wikiMatch("Playa de las Catedrales", [page("Ribadeo", 300), page("Praia As Catedrais", 900), page("Playa de las Catedrales", 120)]);
  assert.equal(got?.title, "Playa de las Catedrales");
});

test("Portuguese name for a Spanish-sent place still needs a shared word", () => {
  assert.equal(wikiMatch("Castelo de Guimarães", [page("Castelo de Guimarães", 50)])?.title, "Castelo de Guimarães");
  assert.equal(wikiMatch("Castillo de Butrón", [page("Castillo de Arteaga", 80)]), undefined);
});

test("a café next to a church gets no church photo", () => {
  assert.equal(wikiMatch("Café Correeiro", [page("Igreja de Nossa Senhora da Graça (Sagres)", 60)]), undefined);
});

test("too far or no picture: nothing", () => {
  assert.equal(wikiMatch("Mosteiro da Batalha", [page("Mosteiro da Batalha", 800)]), undefined);
  assert.equal(wikiMatch("Mosteiro da Batalha", [{ ...page("Mosteiro da Batalha", 50), thumbnail: undefined }]), undefined);
});

test("a name that is only generic words never matches", () => {
  assert.equal(wikiMatch("Parking", [page("Parking de la playa", 10)]), undefined);
});
