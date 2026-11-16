import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryByRules, categoryFromNominatim, categoryFromTags, inBigCity } from "../lib/dock/category";

// The owner's real sent places (2026-10-26 … 11-15), Spain + Portugal.
const HISTORY: Array<[string, string | null, string | null]> = [
  ["Parking Campo das Cebolas - EMEL", null, "parking"],
  ["FNAC", "Centro Colombo, Av. Lusíada Lj A - 103, 1500-392 Lisboa, Portugal", "shopping"],
  ["Mercadona", "Av. Gen. Pedro Cardoso 20, 2500-922 Caldas da Rainha, Portugal", "grocery"],
  ["Intermarché Caldas da Rainha", "Edificio Intermarché, Quinta dos Pinheiros Lote 1, 2500-297 Caldas da Rainha", "grocery"],
  ["Parque de Campismo Orbitur Foz de Arelho.", "R. Maldonado Freitas S/N, 2500-516 Foz do Arelho, Portugal", "camp"],
  ["Vila do Conde", "Av. Fonte Cova 400, 4485-592 Vila Do Conde Fashion Outlet, Portugal", null], // OSM decides
  ["IKEA Matosinhos - Furniture and home decor store", "Av. Dr. Óscar Lopes, 4450-745 Matosinhos, Portugal", "shopping"],
  ["Tattoo and Piercing", "rua antonio oliveira braga - 83 - RÉS DO CHÃO, 4470-141, Portugal", "services"],
  ["LEROY MERLIN", "R. de Domingos Oliveira, 4470-265 Maia, Portugal", "shopping"],
  ["Lidl - Mindelo", "R. Nova da Gândara 2, 4485-613 Mindelo, Portugal", "grocery"],
  ["Vetmindelo - Clínica Veterinária", "R. da Escola 26, 4485-485 Mindelo, Portugal", "services"],
  ["Vila do Conde Retail Park", "4485-592 Vila Chã, Portugal", "shopping"],
  ["Pingo Doce Lavra", "R. dos Castanheiros 119, 4455-089 Lavra, Portugal", "grocery"],
  ["Miradouro - Spotting Point Porto LPPR", "R. Velha Vilar do Sr. 309 169, 4470-558 Vila Nova da Telha, Portugal", "sight"],
  ["MAR Shopping Matosinhos", "Avenida Doutor Óscar Lopes Matosinhos, 4450-337 Leça da Palmeira, Portugal", "shopping"],
  ["Estacionamento Duque de Loulé", "Largo Actor Dias, 4000-098 Porto, Portugal", "parking"],
  ["Norauto Maia", "R. Velha de Mandim 79, 4470-263 Maia, Portugal", "shopping"],
  ["Parque de Campismo de Vila Chã", "Parque de Campismo de Vila Chã, 150, Rua do Sol, Vila Chã, Vila do Conde", "camp"],
  ["Camping Municipal Os Invernadeiros", "Rúa do Seixo, Os Xugueiros, Galicia", "camp"],
  ["Aparcadoiro das Triguerizas", "32800 Celanova, Province of Ourense, España", "parking"],
  ["Roman Caldaria of Bande (Hotsprings)", "32846 Bande, Province of Ourense, España", "sight"],
  ["Recreación de Poblado Castrexo", "32817 Celanova, Province of Ourense, España", "sight"],
  ["Restaurante La Terrazza da Paolo", "Rúa do Progreso, 76, 32003 Ourense, Province of Ourense, España", "eat"],
  ["Aparcamento de Terra A Barreira", "Rúa de Don Pepe Puga, 4, 32660 Allariz, Ourense, España", "parking"],
  ["Ponte Vella Mall", "Rúa Ribeira Sacra, 50, 32003 Ourense, España", "shopping"],
  ["Supermercados Dia", "Tr.ª Alfredo Nan, 4 - 6, 32660 Allariz, Province of Ourense, España", "grocery"],
  ["Parking gratuito Convento de Santa Clara", "32660 Allariz, Province of Ourense, España", "parking"],
  ["Camping Os Invernadeiros", "Carr. Celanova, 0, 32660 Allariz, Province of Ourense, España", "camp"],
  ["Allariz", "Allariz, Ourense, España", "town"],
  ["Camping Picos de Europa", "Carretera, AS-114, km. 16, 33556 Avín, Asturias, España", "camp"],
  ["BM Supermercados", null, "grocery"],
  ["Ermita de Castro", null, "sight"],
  ["Pico Alto Cabeza Mayor (614 m.)", null, "sight"],
  ["Casa de indianos", null, "sight"],
  ["Pico Cardosas (607 m.)", null, "sight"],
];

test("rules classify the owner's history", () => {
  for (const [title, address, want] of HISTORY) assert.equal(categoryByRules(title, address), want, title);
});

test("ordinary words don't trip chain names", () => {
  assert.equal(categoryByRules("Bar El Día", null), "eat");
  assert.notEqual(categoryByRules("Sagrada Família", "Carrer de Mallorca, 401, 08013 Barcelona, España"), "grocery");
  assert.equal(categoryByRules("Dia", "C. Mayor 3, 33550 Cangas de Onís, España"), "grocery");
  assert.equal(categoryByRules("Repsol", "N-634, 33500 Llanes, España"), "fuel");
  assert.equal(categoryByRules("Área de Autocaravanas de Peniche", null), "camp");
  assert.equal(categoryByRules("Galp Mértola", null), "fuel");
  assert.equal(categoryByRules("Praia da Ursa", null), "sight");
});

test("big cities: the address part, not a lookalike", () => {
  assert.equal(inBigCity("Largo Actor Dias, 4000-098 Porto, Portugal"), true);
  assert.equal(inBigCity("Centro Colombo, Av. Lusíada Lj A - 103, 1500-392 Lisboa, Portugal"), true);
  assert.equal(inBigCity("Rúa Ribeira Sacra, 50, 32003 Ourense, España"), true);
  assert.equal(inBigCity("Porto Covo, 7520-437 Porto Covo, Portugal"), false);
  assert.equal(inBigCity("32660 Allariz, Province of Ourense, España"), false); // the province, not the city
  assert.equal(inBigCity("R. Nova da Gândara 2, 4485-613 Mindelo, Portugal"), false);
  assert.equal(inBigCity(null), false);
});

test("OSM tags and Nominatim results map to categories", () => {
  assert.equal(categoryFromTags({ tourism: "camp_site" }), "camp");
  assert.equal(categoryFromTags({ amenity: "fuel", brand: "Repsol" }), "fuel");
  assert.equal(categoryFromTags({ shop: "supermarket" }), "grocery");
  assert.equal(categoryFromTags({ shop: "clothes" }), "shopping");
  assert.equal(categoryFromTags({ amenity: "cafe" }), "eat");
  assert.equal(categoryFromTags({ place: "village" }), "town");
  assert.equal(categoryFromTags({ natural: "peak" }), "sight");
  assert.equal(categoryFromNominatim("highway", "residential", "road"), "other");
  assert.equal(categoryFromNominatim("place", "village", "village"), "town");
});

import { categoryByOsm } from "../lib/dock/category";

/** A fetch that answers Overpass with [elements] and Nominatim with [reverse]. */
function fakeOsm(elements: unknown[], reverse: unknown = {}): typeof fetch {
  return (async (url: string | URL | Request) =>
    new Response(JSON.stringify(String(url).includes("overpass") ? { elements } : reverse), { status: 200 })) as typeof fetch;
}

test("OSM: the object named like the title wins; towns by exact name", async () => {
  // Allariz (Ourense): the town node plus a shop called "Allariz Moda" at the pin.
  const allariz = fakeOsm([
    { lat: 42.1892, lon: -7.8011, tags: { name: "Allariz Moda", shop: "clothes" } },
    { lat: 42.1903, lon: -7.8002, tags: { name: "Allariz", place: "town" } },
  ]);
  assert.equal(await categoryByOsm("Allariz", { lat: 42.1893, lng: -7.801 }, allariz), "town");
  // Las Arenas: Arenas de Cabrales' village node 300 m away, nothing named at the pin.
  const arenas = fakeOsm([{ lat: 43.3005, lon: -4.8145, tags: { name: "Arenas de Cabrales", place: "village" } }]);
  assert.equal(await categoryByOsm("Las Arenas", { lat: 43.3028, lng: -4.8141 }, arenas), "town");
  // A café at the pin, unnamed match: the nearest mapped thing within 40 m.
  const brecha = fakeOsm([{ lat: 41.15601, lon: -8.61902, tags: { name: "Brecha", amenity: "cafe" } }]);
  assert.equal(await categoryByOsm("Brecha Porto", { lat: 41.156, lng: -8.619 }, brecha), "eat");
  // Overpass has nothing: Nominatim's reverse answer.
  const street = fakeOsm([], { category: "highway", type: "residential", addresstype: "road" });
  assert.equal(await categoryByOsm("R. Visc. Morais", { lat: 39.441, lng: -9.222 }, street), "other");
});

test("street-address titles are 'other'", () => {
  assert.equal(categoryByRules("R. Visc. Morais", "R. Visc. Morais, Foz do Arelho, Portugal"), "other");
  assert.equal(categoryByRules("Calle Mayor 3", null), "other");
});
