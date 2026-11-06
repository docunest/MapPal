// Render-time ranking and output tiers (docs/PLAN.md → validator output
// tiers, use cases 1–3). Runs wherever the clock is right: on the device
// normally; on the server for evidence runs, with localWallClock().
//
// Cached results never store "open"/"closed" — that depends on when you look.
import { distanceMeters, type LatLng } from "../geo";
import type { HoursState } from "../openingHours";
import type { ResultItem, ScenarioConfig } from "./types";

export type OutputTier = "recommended" | "closedToday" | "smallOpen" | "unverified";

export interface ShownItem extends ResultItem {
  distance: number;
  score: number;
  hours: HoursState;
  /** "open" now, "later" opens later today, "closed" not again today, "unknown" no/unclear hours. */
  today: "open" | "later" | "closed" | "unknown";
}

export interface Tiers {
  recommended: ShownItem[];
  closedToday: ShownItem[];
  smallOpen: ShownItem[];
  unverified: ShownItem[];
}

export type HoursEvaluator = (item: ResultItem, now: Date) => HoursState;

/** Higher is better: the tier's bonus in km minus the distance in km. */
export function score(item: ResultItem, distanceM: number, config: ScenarioConfig): number {
  return (config.tierBonusKm[item.tier] ?? 0) - distanceM / 1000;
}

function todayState(h: HoursState, now: Date): ShownItem["today"] {
  if (h.state === "open") return "open";
  if (h.state === "closed") {
    if (h.next && h.next.toDateString() === now.toDateString()) return "later";
    return "closed";
  }
  return "unknown";
}

export function rankAndTier(
  items: ResultItem[],
  at: LatLng,
  config: ScenarioConfig,
  now: Date,
  evaluate: HoursEvaluator,
): Tiers {
  const shown: ShownItem[] = items
    .map((i) => {
      const distance = Math.round(distanceMeters(at, i));
      const hours = evaluate(i, now);
      return { ...i, distance, score: score(i, distance, config), hours, today: todayState(hours, now) };
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance);

  const t: Tiers = { recommended: [], closedToday: [], smallOpen: [], unverified: [] };
  const n = config.perTier;
  const push = (k: OutputTier, i: ShownItem) => {
    if (t[k].length < n) t[k].push(i);
  };
  for (const i of shown) {
    // Never assume: no or unclear hours → unverified, whatever the store.
    if (i.verdict !== "real" || i.today === "unknown") push("unverified", i);
    else if (i.today === "closed") {
      if (i.big) push("closedToday", i);
    } else if (i.big || t.recommended.length < Math.ceil(n / 2)) push("recommended", i);
    else push("smallOpen", i);
  }
  // Small open shops: when big stores are closed today, surface the best
  // open small ones nearby, nearest first.
  if (!t.smallOpen.length) {
    const taken = new Set(t.recommended.map((i) => i.key));
    t.smallOpen = shown
      .filter((i) => !i.big && i.verdict === "real" && (i.today === "open" || i.today === "later") && !taken.has(i.key))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, n);
  }
  return t;
}

/**
 * A Date whose *local* fields (in this process's time zone) show the wall
 * clock in `timeZone` — so opening_hours, which reads local fields, evaluates
 * Spanish/Portuguese hours correctly on a UTC server.
 */
export function localWallClock(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** Time zone for an Iberian point (Canary Islands and Azores/Madeira by latitude/longitude). */
export function iberianTimeZone(p: LatLng, country?: string): string {
  if (p.lat < 30 && p.lng < -12) return "Atlantic/Canary";
  if (p.lng < -24) return "Atlantic/Azores";
  if (p.lat < 34 && p.lng < -15) return "Atlantic/Madeira";
  if (country === "PT" || (!country && p.lng < -6.9 && p.lat < 42.2 && p.lat > 36.9)) return "Europe/Lisbon";
  return "Europe/Madrid";
}
