// Hard budget caps per run (design doc, Phase 0 step 2) and the token
// arithmetic behind them. The server counts everything it hands the agent;
// that is the part of the agent's spend the server can actually see.
import type { AgentCategory, Caps, Counters, Estimate } from "./types";

export const DEFAULT_CAPS: Caps = {
  tokens: 150_000,
  cafes: 25,
  exploration: 15,
  pages: 15,
  images: 60,
  googleDetails: 40,
  googlePhotos: 40,
  batchSize: 5,
};

/** Env override, e.g. MAPPAL_AGENT_CAP_TOKENS=80000. */
export function capsFromEnv(env: Record<string, string | undefined> = process.env, base = DEFAULT_CAPS): Caps {
  const out = { ...base };
  for (const key of Object.keys(base) as Array<keyof Caps>) {
    const v = env[`MAPPAL_AGENT_CAP_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`];
    const n = v === undefined ? NaN : Number(v);
    if (Number.isFinite(n) && n >= 0) out[key] = Math.round(n);
  }
  return out;
}

/** ~4 characters per token for mixed es/pt/en text with some JSON. */
export const textTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * Claude's image cost: about width × height / 750 tokens after it scales the
 * long edge to ≤ 1568 px (and the area to ≤ ~1.15 MP). Unknown size → the max.
 */
export function imageTokens(width?: number, height?: number): number {
  if (!width || !height) return 1600;
  let w = width;
  let h = height;
  const long = Math.max(w, h);
  if (long > 1568) {
    w = (w * 1568) / long;
    h = (h * 1568) / long;
  }
  const area = w * h;
  if (area > 1_150_000) {
    const k = Math.sqrt(1_150_000 / area);
    w *= k;
    h *= k;
  }
  return Math.min(1600, Math.ceil((w * h) / 750));
}

export type CapName = "tokens" | "pages" | "images" | "googleDetails" | "googlePhotos" | AgentCategory;

/** Which cap a further spend would break, or null if it fits. */
export function wouldBreak(c: Counters, caps: Caps, spend: Partial<Record<"tokens" | "pages" | "images" | "googleDetails" | "googlePhotos", number>>): CapName | null {
  for (const k of ["tokens", "pages", "images", "googleDetails", "googlePhotos"] as const) {
    const add = spend[k] ?? 0;
    if (add > 0 && c[k] + add > caps[k]) return k;
  }
  return null;
}

export const CAP_LABEL: Record<CapName, string> = {
  tokens: "content tokens",
  pages: "web pages",
  images: "images",
  googleDetails: "Google place details",
  googlePhotos: "Google photos",
  cafes: "cafes to check",
  exploration: "exploration spots to check",
};

// Per-place guesses for the dry run, from the digest format (domain/digest.ts):
// text with Google ≈ 450 tokens (facts + 3 short reviews), without ≈ 180;
// a 480 px photo ≈ 230–310 tokens; a menu page ≈ 2,500.
const PER_PLACE = {
  cafes: { google: 450, plain: 180 },
  exploration: { google: 420, plain: 300 }, // Wikipedia lead when there is one
};
const PHOTO = 300;
const MENU_PAGE = 2500;
// Claude Code re-reads its whole context on every turn (from cache): system
// prompt, tools and skill ≈ 25 k, plus what the run has added so far.
const BASE_CONTEXT = 25_000;
const OUTPUT_PER_PLACE = 250;

export function estimate(counts: Record<AgentCategory, number>, google: boolean, caps: Caps, menuPages = 8): Estimate {
  const cafes = Math.min(counts.cafes, caps.cafes);
  const explore = Math.min(counts.exploration, caps.exploration);
  const withPhoto = cafes + explore; // one photo each where one exists
  const pages = Math.min(caps.pages, google ? menuPages : menuPages + Math.min(cafes, 7));
  const raw =
    cafes * (google ? PER_PLACE.cafes.google : PER_PLACE.cafes.plain) +
    explore * (google ? PER_PLACE.exploration.google : PER_PLACE.exploration.plain) +
    withPhoto * PHOTO +
    pages * MENU_PAGE +
    3000; // plan + small replies
  const servedTokens = Math.min(caps.tokens, raw);
  const batches = Math.ceil(cafes / caps.batchSize) + Math.ceil(explore / caps.batchSize);
  const agentTurns = batches * 2 + pages + 6; // fetch + submit per batch, pages, plan/start/finish
  const outputTokens = (cafes + explore) * OUTPUT_PER_PLACE;
  // Context grows roughly linearly from BASE to BASE + served over the run.
  const cachedRereadTokens = Math.round(agentTurns * (BASE_CONTEXT + servedTokens / 2));
  const googleDetails = google ? Math.min(caps.googleDetails, cafes + explore) : 0;
  const googlePhotos = google ? Math.min(caps.googlePhotos, cafes + explore) : 0;
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
  const text =
    `About ${k(servedTokens)} tokens of material (cap ${k(caps.tokens)}), ${pages} web pages, ${withPhoto} photos` +
    (google ? `, ${googleDetails} Google details + ${googlePhotos} Google photos (free tier)` : ", no Google (no key)") +
    `; the agent writes ~${k(outputTokens)} tokens and re-reads ~${k(cachedRereadTokens)} from cache over ~${agentTurns} turns.`;
  return { servedTokens, pages, images: withPhoto, googleDetails, googlePhotos, agentTurns, outputTokens, cachedRereadTokens, text };
}
