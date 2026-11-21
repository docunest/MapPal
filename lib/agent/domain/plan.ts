// The dry run (design doc Phase 0 step 6): zone, candidates after the cheap
// rules, what is already cached, and the estimate — before any spending.
import { estimate } from "./caps";
import { cafeRules } from "./cafeRules";
import { exploreRules } from "./exploreRules";
import type { AgentCategory, Candidate, Caps, OsmThing, Plan, PlanCategory, Zone } from "./types";

/**
 * Best-first, but every town gets a look: each circle's best 3 first, the
 * rest of the cap by score. Without circles
 * (exploration) it is plain best-first.
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

export function buildPlan(
  zone: Zone,
  input: Record<AgentCategory, { things: OsmThing[]; failed?: string }>,
  cachedRefs: Set<string>,
  caps: Caps,
  google: boolean,
  place: { country?: string; lang: string } = { lang: "es" },
): Plan {
  const notes: string[] = [];
  const cat = (category: AgentCategory): PlanCategory => {
    const { things, failed } = input[category];
    if (failed) notes.push(`${category}: OpenStreetMap query failed (${failed}) — nothing to check for it in this run.`);
    const r = category === "cafes" ? cafeRules(things, zone) : exploreRules(things, zone);
    const found = r.candidates.length + r.dropped.length;
    const cached = r.candidates.filter((c) => cachedRefs.has(c.osmRef)).map((c) => c.name);
    const fresh = r.candidates.filter((c) => !cachedRefs.has(c.osmRef));
    const limit = caps[category];
    const prefix = category === "cafes" ? "c" : "e";
    const candidates = spread(fresh, limit).map((c, i) => ({ ...c, id: `${prefix}${i + 1}` }));
    return { found, dropped: r.dropped, cached, candidates, overCap: Math.max(0, fresh.length - limit) };
  };
  const categories = { cafes: cat("cafes"), exploration: cat("exploration") };
  if (!google) notes.push("No Google key: cafes are judged from OSM tags, their website and its photo only (no reviews, no Google hours).");
  const est = estimate({ cafes: categories.cafes.candidates.length, exploration: categories.exploration.candidates.length }, google, caps);
  return { zone, categories, estimate: est, google, notes, ...place };
}

/** The dry run as the agent shows it to the owner. */
export function planText(runId: string, plan: Plan, caps: Caps): string {
  const z = plan.zone;
  const lines = [
    `Run ${runId} — DRY RUN, nothing spent yet.`,
    `Target: ${z.target.label} (${z.target.source}${z.target.at ? `, ${z.target.at}` : ""}).`,
    `Why this zone: ${z.why}`,
    `Cafe circles: ${z.cafeCircles.map((c) => `${c.label} ${c.radiusM} m`).join(", ")}. Exploration: ${z.explore.radiusM / 1000} km around the target.`,
    `Tiles (geohash-5): ${z.tiles.cafes.length} for cafes, ${z.tiles.exploration.length} for exploration.`,
  ];
  for (const [name, c] of Object.entries(plan.categories)) {
    const reasons = new Map<string, number>();
    for (const d of c.dropped) reasons.set(d.reason.replace(/ \(.*\)$/, ""), (reasons.get(d.reason.replace(/ \(.*\)$/, "")) ?? 0) + 1);
    lines.push(
      `${name}: ${c.found} on the map → ${c.dropped.length} dropped by rules (${[...reasons].map(([r, n]) => `${n} ${r}`).join(", ") || "none"}), ${c.cached.length} already reviewed (cached), ${c.candidates.length} to check${c.overCap ? `, ${c.overCap} more over the cap` : ""}.`,
    );
    if (c.candidates.length) lines.push(`  first: ${c.candidates.slice(0, 8).map((x) => `${x.id} ${x.name}`).join(" · ")}`);
  }
  lines.push(`Estimate: ${plan.estimate.text}`);
  lines.push(`Caps: ${caps.tokens} tokens, ${caps.cafes} cafes + ${caps.exploration} exploration spots, ${caps.pages} pages, ${caps.images} images, ${caps.googleDetails} Google details, ${caps.googlePhotos} Google photos.`);
  for (const n of plan.notes) lines.push(`Note: ${n}`);
  lines.push("Show this to the owner and wait for a yes. Then call start_run with owner_approved=true.");
  return lines.join("\n");
}
