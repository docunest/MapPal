// App-side cost guardrail for paid sources (docs/PLAN.md §7). Google's own
// console quotas are the hard backstop; this stops us *before* reaching
// them, so the bill stays inside the free tier.
import type { SourceId, UsageGuard } from "./types";

export interface Cap {
  daily: number;
  monthly: number;
}

// Defaults keep every paid SKU inside Google's free monthly allowance
// (prices/allowances checked 2026-10-25, Places API New):
//   Text Search IDs Only      free, unlimited
//   Place Details Ent.+Atmos. 1,000 free/month, then $25 / 1,000
//   Nearby Search Pro         5,000 free/month, then $32 / 1,000
// DeepSeek isn't free but costs ~nothing per call; capped anyway.
export const DEFAULT_CAPS: Record<string, Cap> = {
  "google:text-search-ids": { daily: 600, monthly: 15000 },
  "google:place-details-atmosphere": { daily: 30, monthly: 900 },
  "google:nearby-search-pro": { daily: 120, monthly: 4500 },
  "deepseek:chat": { daily: 150, monthly: 3000 },
};

/** Env override: CAP_GOOGLE_PLACE_DETAILS_ATMOSPHERE_DAILY=10 etc. */
export function capFor(source: SourceId, sku: string, env: Record<string, string | undefined> = process.env): Cap {
  const key = `${source}:${sku}`;
  const base = DEFAULT_CAPS[key] ?? { daily: 0, monthly: 0 };
  const envKey = `CAP_${source}_${sku}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const num = (v: string | undefined, fallback: number) => {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return { daily: num(env[`${envKey}_DAILY`], base.daily), monthly: num(env[`${envKey}_MONTHLY`], base.monthly) };
}

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** Storage for counters — the DB in the app, a Map in tests. */
export interface UsageStore {
  /** Atomically add `delta` to today's counter and return the new value. */
  add(source: string, sku: string, day: string, delta: number): Promise<number>;
  /** Sum of counters for days starting with `monthPrefix` ("YYYY-MM"). */
  monthTotal(source: string, sku: string, monthPrefix: string): Promise<number>;
}

export function createUsageGuard(store: UsageStore, now: () => Date = () => new Date()): UsageGuard {
  return {
    async take(source, sku) {
      const cap = capFor(source, sku);
      if (cap.daily <= 0 || cap.monthly <= 0) return false;
      const day = today(now());
      // Reserve first, then check: concurrent requests can't both slip under
      // the cap. A refused reservation is given back.
      const dayCount = await store.add(source, sku, day, 1);
      const monthCount = await store.monthTotal(source, sku, day.slice(0, 7));
      if (dayCount > cap.daily || monthCount > cap.monthly) {
        await store.add(source, sku, day, -1);
        return false;
      }
      return true;
    },
  };
}

export function memoryUsageStore(): UsageStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async add(source, sku, day, delta) {
      const k = `${source}|${sku}|${day}`;
      const v = (counts.get(k) ?? 0) + delta;
      counts.set(k, v);
      return v;
    },
    async monthTotal(source, sku, prefix) {
      let total = 0;
      for (const [k, v] of counts) {
        const [s, u, d] = k.split("|");
        if (s === source && u === sku && d.startsWith(prefix)) total += v;
      }
      return total;
    },
  };
}
