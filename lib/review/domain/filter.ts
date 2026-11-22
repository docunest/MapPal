// Scope → the swipe pool, nearest first. Pure, so it's tested without a DB.
import { bearingDegrees, distanceMeters } from "@/lib/geo";
import type { ReviewPlace, Scope } from "./types";

export const MAX_CARDS = 300;
export const TIER_ORDER = ["free", "€", "€€", "€€€", "€€€€"];
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function applyScope(places: ReviewPlace[], scope: Scope): ReviewPlace[] {
  const out: ReviewPlace[] = [];
  for (const p of places) {
    if (scope.categories.length && !scope.categories.includes(p.category)) continue;
    if (!scope.categories.length && scope.exclude?.includes(p.category)) continue;
    if (scope.priceMax !== undefined && p.agent?.price?.tier) {
      const t = TIER_ORDER.indexOf(p.agent.price.tier);
      if (t > scope.priceMax) continue;
    }
    if (p.agent?.eventStart && scope.today) {
      const end = p.agent.eventEnd ?? p.agent.eventStart;
      if (end < scope.today) continue; // over
      if (scope.withinDays !== undefined && p.agent.eventStart > addDays(scope.today, scope.withinDays)) continue;
    }
    if (scope.pool === "checked" && !(p.checked && p.agent?.keep)) continue;
    if (scope.pool === "checked-all" && !p.checked) continue;
    const d = distanceMeters(scope, p);
    if (scope.radiusKm !== null && d > scope.radiusKm * 1000) continue;
    const mine = p.votes?.[scope.voter];
    if (scope.mine === "unvoted" ? mine !== undefined : scope.mine !== "any" && mine !== scope.mine) continue;
    if (scope.other) {
      const theirs = p.votes?.[scope.other.voter];
      if (scope.other.status === "voted" && !theirs) continue;
      if (scope.other.status === "like" && theirs !== "like") continue;
      if (scope.other.status === "unvoted" && theirs) continue;
    }
    out.push({ ...p, distanceM: Math.round(d), bearing: Math.round(bearingDegrees(scope, p)) });
  }
  // Nearest first; among equals, the agent's surer picks first.
  out.sort((a, b) => a.distanceM! - b.distanceM! || (b.agent?.confidence ?? 0) - (a.agent?.confidence ?? 0));
  return out.slice(0, MAX_CARDS);
}

/** A Commons file page → its thumbnail (older runs stored only the page). */
export function photoFrom(p: { url?: string; page?: string; source?: string; credit?: string } | undefined): { url: string; credit?: string; page?: string } | undefined {
  if (!p || p.source === "google") return undefined;
  if (p.url) return { url: p.url, credit: p.credit, page: p.page };
  const m = p.page?.match(/commons\.wikimedia\.org\/wiki\/File:(.+)$/);
  if (m) return { url: `https://commons.wikimedia.org/wiki/Special:FilePath/${m[1]}?width=640`, credit: p.credit ?? "Wikimedia Commons", page: p.page };
  return undefined;
}

/** Was the family there / did they send it to the car? Within 75 m of a GPS fix or a sent link (approximate: a single fix, no dwell time). */
export const NEAR_M = 75; // 150 m marked the neighbours of a café you parked at as "been here" too

export function markTravel(places: ReviewPlace[], positions: Array<{ lat: number; lng: number; at: Date }>, sent: Array<{ lat: number; lng: number; at: Date }>) {
  for (const p of places) {
    const box = (q: { lat: number; lng: number }) => Math.abs(q.lat - p.lat) < 0.002 && Math.abs(q.lng - p.lng) < 0.003;
    const v = positions.filter((q) => box(q) && distanceMeters(q, p) <= NEAR_M).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (v) p.visitedAt = v.at.toISOString();
    const s = sent.filter((q) => box(q) && distanceMeters(q, p) <= NEAR_M).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (s) p.sentAt = s.at.toISOString();
  }
}
