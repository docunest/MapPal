// Pure rules for words, letters, pairs and triples (domains/reading/DESIGN.md). No IO.

export const KINDS = ["word", "letter", "pair", "triple"] as const;
export type Kind = (typeof KINDS)[number];
export const STATUSES = ["naujas", "mokomes", "extra", "ismokta"] as const;
export type Status = (typeof STATUSES)[number];
export const DIFFICULTIES = ["lengvas", "vidutinis", "sunkus"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
/** 0–3 suns, "bomb", or null (not enough tries yet). */
export type Grade = 0 | 1 | 2 | 3 | "bomb" | null;

/** Clip kinds each item kind has. Letters: sound + name; words: whole word + syllables. */
export const CLIP_KINDS: Record<Kind, string[]> = {
  word: ["word", "syllables"],
  letter: ["sound", "name"],
  pair: ["sound"],
  triple: ["sound"],
};
export const VOICES = ["azure-ona", "azure-ona-hd", "azure-leonas"] as const;
export const VOICE_LABEL: Record<string, string> = {
  "azure-ona": "Ona", "azure-ona-hd": "Ona HD", "azure-leonas": "Leonas", offline: "Senas balsas", parent: "Mano įrašas",
};

/** Statuses the games show, and how often (Extra ×3, Išmokta now and then as review). */
export const GAME_WEIGHT: Record<Status, number> = { naujas: 0, mokomes: 1, extra: 3, ismokta: 0.33 };

const V = "aąeęėiįyouųū";
const DIPH = ["ai", "au", "ei", "ui", "ie", "uo"];

/** Letters with dž/ch/dz and the diphthongs kept together. */
export function units(w: string): string[] {
  const out: string[] = [];
  const c = Array.from(w);
  for (let i = 0; i < c.length; ) {
    const two = c[i] + (c[i + 1] ?? "");
    if (["dž", "ch", "dz", ...DIPH].includes(two)) { out.push(two); i += 2; } else { out.push(c[i]); i += 1; }
  }
  return out;
}
const isVowelUnit = (u: string) => DIPH.includes(u) || (u.length === 1 && V.includes(u));

/** Lithuanian syllables for reading aloud: V-CV, VC-CV(C) ("me-dis", "ran-ka", "ak-muo"). */
export function syllabify(word: string): string {
  const us = units(word.toLowerCase());
  const nuclei = us.map((u, i) => (isVowelUnit(u) ? i : -1)).filter((i) => i >= 0);
  if (nuclei.length < 2) return word;
  const parts: string[] = [];
  let start = 0;
  for (let k = 0; k < nuclei.length - 1; k++) {
    const between = nuclei[k + 1] - nuclei[k] - 1;
    const cut = nuclei[k] + 1 + (between <= 1 ? 0 : 1);
    parts.push(us.slice(start, cut).join(""));
    start = cut;
  }
  parts.push(us.slice(start).join(""));
  return parts.join("-");
}

/** First guess at difficulty; the parent can change it. */
export function suggestDifficulty(text: string, kind: Kind): Difficulty {
  const t = text.toLowerCase();
  const special = /[ąęėįųūčšž]/.test(t);
  if (kind === "letter") return /[ąęėįųūyčšžhcf]/.test(t) ? "sunkus" : "lengvas";
  if (kind === "pair") return DIPH.includes(t) ? "sunkus" : special ? "vidutinis" : "lengvas";
  if (kind === "triple") return "sunkus";
  const C = `[^${V}]`;
  const hard = DIPH.some((d) => t.includes(d)) || t.includes("dž") || t.includes("ch") ||
    new RegExp(`^${C}{2}`).test(t) || new RegExp(`${C}{3}`).test(t) || Array.from(t).length >= 6;
  if (hard) return "sunkus";
  if (Array.from(t).length <= 4 && !special) return "lengvas";
  return "vidutinis";
}

/** A word from the list that starts with (else contains) the letter/pair/triple; shortest first. */
export function suggestSample(text: string, words: string[]): string | null {
  const t = text.toLowerCase();
  const byLen = (a: string, b: string) => Array.from(a).length - Array.from(b).length || a.localeCompare(b);
  const starts = words.filter((w) => w.startsWith(t)).sort(byLen);
  if (starts.length) return starts[0];
  const has = words.filter((w) => w.includes(t)).sort(byLen);
  return has[0] ?? null;
}

/**
 * Grade from the item's first tries, newest last (a retry after a miss doesn't count).
 * Last 6: ≥90 % → 3 suns, ≥70 % → 2, ≥50 % → 1, below → a plain grey bomb. Fewer than 3 → null.
 */
export function grade(firstTries: boolean[]): Grade {
  const last = firstTries.slice(-6);
  if (last.length < 3) return null;
  const rate = last.filter(Boolean).length / last.length;
  if (rate >= 0.9) return 3;
  if (rate >= 0.7) return 2;
  if (rate >= 0.5) return 1;
  return "bomb";
}

export function parseGradeOverride(v: string | null | undefined): Grade {
  if (v === "bomb") return "bomb";
  if (v === "0" || v === "1" || v === "2" || v === "3") return Number(v) as 0 | 1 | 2 | 3;
  return null;
}

/** Owner: status changes are suggested, the parent confirms. */
export function suggestStatus(status: Status, g: Grade, tries: number): Status | null {
  if (g === 3 && tries >= 6 && status !== "ismokta") return "ismokta";
  if (g === "bomb" && status !== "extra") return "extra";
  return null;
}

/** A word is approved with a photo and a word clip; letters/pairs/triples with a clip and a sample word. */
export function canApprove(kind: Kind, has: { image: boolean; clip: boolean; sample: boolean }): boolean {
  return kind === "word" ? has.image && has.clip : has.clip && has.sample;
}

export function cleanText(raw: unknown, kind: Kind): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  const n = Array.from(t).length;
  if (!/^[a-ząčęėįšųūž-]+$/.test(t)) return null;
  if (kind === "letter" && n !== 1 && t !== "dž" && t !== "ch") return null;
  if (kind === "pair" && n !== 2) return null;
  if (kind === "triple" && n !== 3) return null;
  if (kind === "word" && (n < 2 || n > 16)) return null;
  return t;
}
