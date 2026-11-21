// Hard budget caps per run (design doc, Phase 0 step 2) and the token
// arithmetic behind them. The server counts everything it hands the agent;
// that is the part of the agent's spend the server can actually see.
import type { Caps, Counters, Estimate } from "./types";

export const DEFAULT_CAPS: Caps = {
  tokens: 150_000,
  places: 60,
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

export type CapName = "tokens" | "pages" | "images" | "googleDetails" | "googlePhotos" | "places";

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
  places: "places per pull",
};

// Per-place guesses for the preview (from the brief format): facts ≈ 180–450
// tokens, a 480–640 px photo ≈ 230–410; the shared layers (charter, format,
// location) ≈ 1,500 once per pull, the use-case layer ≈ 400 per brief.
const PER_PLACE_TEXT = { google: 450, plain: 250 };
const PHOTO = 300;
const SHARED = 1500;
const PER_BRIEF = 400;

export function estimate(places: number, briefs: number, google: boolean, caps: Caps): Estimate {
  const n = Math.min(places, caps.places);
  const raw = SHARED + briefs * PER_BRIEF + n * ((google ? PER_PLACE_TEXT.google : PER_PLACE_TEXT.plain) + PHOTO);
  const servedTokens = Math.min(caps.tokens, raw);
  const k = (x: number) => (x >= 1000 ? `${Math.round(x / 1000)} k` : String(x));
  const text = `about ${k(servedTokens)} tokens of material for ${n} places in ${briefs} brief${briefs === 1 ? "" : "s"} (cap ${k(caps.tokens)})${google ? `, up to ${Math.min(caps.googleDetails, n)} Google details + photos (free tier)` : ", no Google (no key)"}. Claude's own use is measured, not guessed: see the budget log after the run.`;
  return { servedTokens, pages: 0, images: n, googleDetails: google ? Math.min(caps.googleDetails, n) : 0, googlePhotos: google ? Math.min(caps.googlePhotos, n) : 0, agentTurns: 0, outputTokens: 0, cachedRereadTokens: 0, text };
}
