// Brief text, layer by layer. Pure: the same layer inputs give the same text
// and the same hashes. Layers: 1 charter · 2 output format · 3 location ·
// 4 use-case rules · 5 known places (negative list) · 6 places to judge.
import { formatDistance } from "@/lib/geo";
import { shortHash } from "./hash";
import type { Profile } from "./profile";
import type { Zone } from "./types";

export interface LayerRef {
  version?: number;
  hash: string;
}

export function locationLayer(zone: Zone, estimateLine: string | null): { text: string; hash: string } {
  const z = zone;
  const lines = [
    `Target: ${z.target.label} (${z.target.lat.toFixed(5)}, ${z.target.lng.toFixed(5)}; ${z.target.source}).`,
    estimateLine ? `Best guess of where the family is: ${estimateLine}` : "Best guess of where the family is: none (no recent hints).",
    `Zone: ${z.why}`,
    `Town circles (cafes): ${z.cafeCircles.map((c) => `${c.label} ${formatDistance(c.radiusM)}`).join(", ") || "none"}. Exploration: ${Math.round(z.explore.radiusM / 1000)} km around the target.`,
    "Country: Spain/Portugal — local names (es/pt/ca/gl/eu) are normal.",
  ];
  const text = lines.join("\n");
  return { text, hash: shortHash(text) };
}

/** Layer 4: the use case's text with its parents' first (Food › Cool bars), each with its version and hash. */
export function usecaseLayer(p: Profile, chain: Array<{ title: string; body: string } & LayerRef>, stats: { found: number; dropped: Record<string, number> }) {
  const reasons = Object.entries(stats.dropped).map(([r, n]) => `${n} ${r}`).join(", ") || "none";
  const head = chain.map((c) => c.title).join(" › ");
  const versions = chain.map((c) => `v${c.version} · ${c.hash}`).join(" › ");
  const text = chain.length > 1 ? chain.map((c) => `${c.title}: ${c.body}`).join("\n") : (chain[0]?.body ?? "");
  return `## 4. Use case: ${head} (rules ${versions})
${text}
How these places were picked (deterministic rules, no AI): ${stats.found} matching places in the place index around the zone; dropped by the rules: ${reasons}. The rest are ranked by the rules' points (${p.select.map((s) => `${s.kind} ${s.points}`).filter((x, i, a) => a.indexOf(x) === i).slice(0, 8).join(", ")}…) and shown best first.`;
}

export function knownLayer(names: Array<{ name: string; osmRef: string }>): { text: string; hash: string } {
  const sorted = [...names].sort((a, b) => (a.osmRef < b.osmRef ? -1 : 1));
  const hash = shortHash(sorted.map((n) => n.osmRef));
  const shown = sorted.slice(0, 150).map((n) => `${n.name} (${n.osmRef})`).join("; ");
  const text = sorted.length
    ? `## 5. Known places — already judged or already sent; never return these (${sorted.length} · ${hash})\n${shown}${sorted.length > 150 ? `; … and ${sorted.length - 150} more` : ""}`
    : `## 5. Known places (0 · ${hash})\nNone yet in this area for this use case.`;
  return { text, hash };
}
