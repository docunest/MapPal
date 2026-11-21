// Brief text, layer by layer. Pure: the same layer inputs give the same text
// and the same hashes. Layers: 1 charter · 2 output format (+ the server
// contract) · 3 location · 4 use-case rules · 5 known places (negative list) ·
// 6 like/dislike hints (the family's votes) · 7 places to judge.
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

/** One voted place as a hint: what it is and how the family voted — never who voted. */
export interface Hint {
  osmRef: string;
  name: string;
  useCase: string; // its use case title path, e.g. "Food › Cool bars"
  kind?: string;
  facts: string[]; // a few OSM tags, e.g. "cuisine=tapas"
  agentSaid?: string; // the agent's earlier summary, if judged
  likes: number;
  dislikes: number; // don't like
  never: number;
  at: string; // newest vote (ISO), for ordering
}

const hintLine = (h: Hint) => {
  const votes = [h.likes ? `liked${h.likes > 1 ? ` ×${h.likes}` : ""}` : "", h.dislikes ? `disliked${h.dislikes > 1 ? ` ×${h.dislikes}` : ""}` : "", h.never ? `never again${h.never > 1 ? ` ×${h.never}` : ""}` : ""].filter(Boolean).join(", ");
  const what = [h.useCase, h.kind, ...h.facts].filter(Boolean).join(" · ");
  return `- ${h.name} — ${what} (${votes})${h.agentSaid ? ` — earlier AI note: "${h.agentSaid.slice(0, 160)}"` : ""}`;
};

/**
 * Layer 6: what the family liked and disliked (their votes in /review), for
 * the 0–100 score. Same use case first, then the rest of its tree, newest
 * first; at most 12 each way. Votes only — no names of who voted.
 */
export function hintsLayer(hints: Hint[], focus: string, groupTitle: string): { text: string; hash: string; likes: number; dislikes: number } {
  const order = (a: Hint, b: Hint) => Number(b.useCase === focus) - Number(a.useCase === focus) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || (a.osmRef < b.osmRef ? -1 : 1);
  const liked = hints.filter((h) => h.likes > h.dislikes + h.never).sort(order).slice(0, 12);
  const disliked = hints.filter((h) => h.dislikes + h.never > 0 && h.dislikes + h.never >= h.likes).sort(order).slice(0, 12);
  const hash = shortHash([...liked, ...disliked].map((h) => [h.osmRef, h.likes, h.dislikes, h.never]));
  const head = `## 6. Like and dislike hints — the family's votes in ${groupTitle} (${liked.length} liked · ${disliked.length} disliked · ${hash})`;
  const how = "Score every place 0–100 against these: 0 = no-go, 50 = undecided, 100 = a must. Closer to what they liked → higher; like what they disliked (especially \"never again\") → lower. Few or no hints → lean on the use-case text and stay near 50 when unsure.";
  const text = liked.length || disliked.length
    ? [head, how, ...(liked.length ? ["Liked:", ...liked.map(hintLine)] : []), ...(disliked.length ? ["Disliked:", ...disliked.map(hintLine)] : [])].join("\n")
    : `${head}\nNo votes yet here. ${how}`;
  return { text, hash, likes: liked.length, dislikes: disliked.length };
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
