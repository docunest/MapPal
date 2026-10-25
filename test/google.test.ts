// Google Places source. No API key in CI, so responses below follow the
// shapes in Google's Places API (New) documentation — they are NOT recorded
// live responses. What matters most is tested for real: the cap stops calls
// before any request is made, and a match >300 m away is discarded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detailBlocks, googleSource, placeToUtility } from "../lib/sources/google";
import { SourceCappedError, type PlaceRef } from "../lib/sources/types";
import { createUsageGuard, memoryUsageStore } from "../lib/sources/usage";

const place: PlaceRef = {
  key: "osm:node/287010685",
  mode: "utility",
  name: "Estación de Servicio Cabrales",
  lat: 43.3062,
  lng: -4.8259,
  kind: "fuel",
  category: "fuel",
  wiki: [],
  refs: { osm: "node/287010685" },
  userLang: "en",
  localLangs: ["es"],
};

function withFetch(handler: (url: string, init?: RequestInit) => Response) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    return handler(String(url), init);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("details: rating, reviews, hours and fuel prices become tagged blocks", () => {
  const blocks = detailBlocks({
    id: "abc",
    googleMapsUri: "https://maps.google.com/?cid=1",
    rating: 4.3,
    userRatingCount: 212,
    reviews: [{ rating: 5, text: { text: "Cheap diesel, friendly." }, authorAttribution: { displayName: "Ana" }, relativePublishTimeDescription: "a month ago" }],
    currentOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: 7:00 AM – 10:00 PM"] },
    fuelOptions: { fuelPrices: [{ type: "DIESEL", price: { currencyCode: "EUR", units: "1", nanos: 489000000 }, updateTime: "2026-10-20T08:00:00Z" }] },
  });
  assert.deepEqual(blocks.map((b) => b.section.kind), ["rating", "hours", "fuel-prices"]);
  assert.ok(blocks.every((b) => b.source === "google" && b.url === "https://maps.google.com/?cid=1"));
  const fuel = blocks[2].section;
  assert.ok(fuel.kind === "fuel-prices" && fuel.prices[0].type === "Diesel" && fuel.prices[0].price === "1.489 €");
});

test("permanently closed places are dropped from lists", () => {
  assert.equal(placeToUtility({ id: "x", displayName: { text: "Old Galp" }, location: { latitude: 0, longitude: 0 }, businessStatus: "CLOSED_PERMANENTLY" }, "fuel"), null);
});

test("details: capped → no request at all", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test";
  const f = withFetch(() => new Response("{}"));
  try {
    const store = memoryUsageStore();
    await store.add("google", "text-search-ids", new Date().toISOString().slice(0, 10), 100_000);
    await assert.rejects(googleSource.details!(place, { usage: createUsageGuard(store) }), SourceCappedError);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
    delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("details: a name match >300 m away (another branch) is discarded", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test";
  const f = withFetch((url) =>
    url.includes("searchText")
      ? new Response(JSON.stringify({ places: [{ id: "far" }] }))
      : new Response(JSON.stringify({ id: "far", location: { latitude: 43.4, longitude: -4.9 }, rating: 4.9, userRatingCount: 10 })),
  );
  try {
    const blocks = await googleSource.details!(place, { usage: createUsageGuard(memoryUsageStore()) });
    assert.deepEqual(blocks, []);
    assert.equal(f.calls.length, 2);
  } finally {
    f.restore();
    delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("sights with a Wikipedia article never call Google", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test";
  const f = withFetch(() => new Response("{}"));
  try {
    const blocks = await googleSource.details!(
      { ...place, mode: "sight", wiki: [{ lang: "pt", title: "Porto de Leixões" }] },
      { usage: createUsageGuard(memoryUsageStore()) },
    );
    assert.deepEqual(blocks, []);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
    delete process.env.GOOGLE_MAPS_API_KEY;
  }
});
