// The cost guardrail: paid calls stop at the daily and monthly caps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capFor, createUsageGuard, memoryUsageStore } from "../lib/sources/usage";

test("daily cap stops calls and refunds the refused reservation", async () => {
  const store = memoryUsageStore();
  const guard = createUsageGuard(store, () => new Date("2026-10-25T10:00:00Z"));
  const daily = capFor("google", "place-details-atmosphere").daily;
  for (let i = 0; i < daily; i++) assert.equal(await guard.take("google", "place-details-atmosphere"), true);
  assert.equal(await guard.take("google", "place-details-atmosphere"), false);
  assert.equal(store.counts.get("google|place-details-atmosphere|2026-10-25"), daily);
});

test("monthly cap holds across days", async () => {
  const store = memoryUsageStore();
  const { monthly, daily } = capFor("google", "place-details-atmosphere");
  // Fill the month to its cap with earlier days.
  let filled = 0;
  for (let day = 1; filled < monthly; day++) {
    const n = Math.min(daily, monthly - filled);
    await store.add("google", "place-details-atmosphere", `2026-10-${String(day).padStart(2, "0")}`, n);
    filled += n;
  }
  const guard = createUsageGuard(store, () => new Date("2026-10-31T10:00:00Z"));
  assert.equal(await guard.take("google", "place-details-atmosphere"), false);
  // Next month starts fresh.
  const nextMonth = createUsageGuard(store, () => new Date("2026-11-01T10:00:00Z"));
  assert.equal(await nextMonth.take("google", "place-details-atmosphere"), true);
});

test("default caps stay inside Google's free monthly allowance", () => {
  assert.ok(capFor("google", "place-details-atmosphere").monthly <= 1000);
  assert.ok(capFor("google", "nearby-search-pro").monthly <= 5000);
});

test("unknown SKUs are blocked, env can lower a cap", () => {
  assert.deepEqual(capFor("google", "something-new"), { daily: 0, monthly: 0 });
  assert.equal(capFor("google", "place-details-atmosphere", { CAP_GOOGLE_PLACE_DETAILS_ATMOSPHERE_DAILY: "5" }).daily, 5);
});
