// Paging helper for briefs: best-first, but every town gets a look.
import type { Candidate } from "./types";

/**
 * Best-first, but every town gets a look: each circle's best 3 first, the
 * rest by score. Without circles (exploration) it is plain best-first.
 */
export function spread(ranked: Candidate[], limit: number): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of ranked) {
    if (!c.circle) return ranked.slice(0, limit);
    groups.set(c.circle, [...(groups.get(c.circle) ?? []), c]);
  }
  const picked = new Set<Candidate>();
  const share = Math.min(3, Math.floor(limit / Math.max(1, groups.size)));
  for (const list of groups.values()) for (const c of list.slice(0, share)) picked.add(c);
  for (const c of ranked) if (picked.size < limit) picked.add(c);
  return ranked.filter((c) => picked.has(c));
}
