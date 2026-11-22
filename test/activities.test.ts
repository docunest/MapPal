// Activities baseline (owner's survey 2026-11-22): price per family with
// confidence, event dates, food off by default — the filters run in Swipe/Browse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewSchema, tierOf, CONTRACT_LINE } from "../lib/agent/domain/review";
import { applyScope } from "../lib/review/domain/filter";
import type { ReviewPlace, Scope } from "../lib/review/domain/types";
import { datesLabel, priceLabel } from "../components/review/shared";

const place = (key: string, category: string, agent: Partial<NonNullable<ReviewPlace["agent"]>> = {}): ReviewPlace => ({
  key, name: key, category, kind: "x", lat: 39.40, lng: -9.14, checked: true, tags: {},
  agent: { verdict: "real", confidence: 0.8, keep: true, relevant: true, summary: "", evidence: [], reviewedAt: "2026-11-22T00:00:00Z", runId: "r", ...agent },
});
const base: Scope = { lat: 39.4, lng: -9.14, radiusKm: null, categories: [], pool: "everything", voter: "A", mine: "any", today: "2026-11-22" };

test("family price → tier (survey bands × 4)", () => {
  assert.deepEqual([0, 25, 39, 40, 119, 120, 239, 300].map(tierOf), ["free", "€", "€", "€€", "€€", "€€€", "€€€", "€€€€"]);
});

test("contract v3: price, confidence, season, dates and dogs are accepted and named in the contract line", () => {
  const r = reviewSchema.safeParse({ candidate: "ae1", verdict: "real", confidence: 0.9, relevant: true, keep: true, summary: "x", evidence: [], price_family_eur: 40, price_confidence: "high", event_start: "2026-11-27", event_end: "2027-01-03", dogs: "no", season_note: "daily 10–19" });
  assert.ok(r.success);
  assert.ok(!reviewSchema.safeParse({ candidate: "ae1", verdict: "real", confidence: 1, relevant: true, keep: true, summary: "x", evidence: [], event_start: "27/11/2026" }).success);
  for (const k of ["price_family_eur", "price_confidence", "event_start", "dogs", "must_do_reason"]) assert.match(CONTRACT_LINE, new RegExp(k));
});

test("filters: price cap, past events hidden, events within N days, food left out of 'All'", () => {
  const ps = [
    place("boat", "act-water", { price: { familyEur: 300, tier: "€€€€", confidence: "medium" } }),
    place("hike", "act-outdoors", { price: { familyEur: 0, tier: "free", confidence: "high" } }),
    place("noprice", "act-wow"),
    place("vila-natal", "act-events", { eventStart: "2026-11-27", eventEnd: "2027-01-03" }),
    place("carnival", "act-events", { eventStart: "2027-02-14" }),
    place("over", "act-events", { eventStart: "2026-11-01", eventEnd: "2026-11-20" }),
    place("cafe", "cafes"),
  ];
  const keys = (s: Partial<Scope>) => applyScope(ps, { ...base, ...s }).map((p) => p.key).sort();
  assert.deepEqual(keys({ exclude: ["food", "cafes"] }), ["boat", "carnival", "hike", "noprice", "vila-natal"]);
  assert.deepEqual(keys({ exclude: ["cafes"], priceMax: 2 }), ["carnival", "hike", "noprice", "vila-natal"]);
  assert.deepEqual(keys({ exclude: ["cafes"], withinDays: 30 }), ["boat", "hike", "noprice", "vila-natal"]);
  assert.deepEqual(keys({ categories: ["cafes"], exclude: ["cafes"] }), ["cafe"]); // picked by name → shown
});

test("labels: price with how sure, dates", () => {
  assert.equal(priceLabel({ familyEur: 90, tier: "€€", confidence: "medium" }), "€€ ~€90 ●●○");
  assert.equal(priceLabel({ familyEur: 0, tier: "free", confidence: "high" }), "Free ●●●");
  assert.equal(priceLabel(undefined), null);
  assert.equal(datesLabel("2026-11-27", "2027-01-03"), "📅 27 Nov – 3 Jan");
  assert.equal(datesLabel("2026-12-06", "2026-12-06"), "📅 6 Dec");
});
