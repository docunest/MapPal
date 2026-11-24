// Pure rules for reading attempts: validation of what the game sends, and the
// summary the parent sees. No IO, no framework.

export type AttemptInput = {
  id: string;
  level: number;
  item: string;
  options: string[];
  answer: string;
  correct: boolean;
  firstTry: boolean;
  hintUsed: boolean;
  responseMs: number;
  clientAt: string | null;
  /** Per-letter result for word levels, e.g. "11011" (1 = right first time). */
  letterOk: string | null;
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.length >= 1 && v.length <= max ? v : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Returns the cleaned attempt, or a message saying which field is wrong. */
export function parseAttempt(raw: unknown): AttemptInput | string {
  if (!raw || typeof raw !== "object") return "attempt must be an object";
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(r.id) ? r.id : null;
  if (!id) return "id must be 8 to 64 letters, digits, - or _";
  // Branch A (owner's levels) is 1-9, branch B (Montessori) 11-19; room for more up to 99.
  const level = Number.isInteger(r.level) && (r.level as number) >= 1 && (r.level as number) <= 99 ? (r.level as number) : null;
  if (level === null) return "level must be 1 to 99";
  const item = str(r.item, 16);
  if (!item) return "item is required";
  const answer = str(r.answer, 16);
  if (!answer) return "answer is required";
  // Writing levels show no options (0); the moveable alphabet can show up to the whole alphabet (32).
  if (!Array.isArray(r.options) || r.options.length > 32) return "options must be 0 to 32 items";
  const options: string[] = [];
  for (const o of r.options) {
    const s = str(o, 16);
    if (!s) return "each option must be 1 to 16 characters";
    options.push(s);
  }
  const correct = bool(r.correct), firstTry = bool(r.first_try), hintUsed = bool(r.hint_used);
  if (correct === null || firstTry === null || hintUsed === null) return "correct, first_try and hint_used must be true or false";
  const responseMs = Number.isInteger(r.response_ms) && (r.response_ms as number) >= 0 && (r.response_ms as number) <= 600000 ? (r.response_ms as number) : null;
  if (responseMs === null) return "response_ms must be 0 to 600000";
  const clientAt = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? new Date(r.at).toISOString() : null;
  let letterOk: string | null = null;
  if (r.letter_ok !== undefined && r.letter_ok !== null) {
    if (typeof r.letter_ok !== "string" || !/^[01]{1,16}$/.test(r.letter_ok)) return "letter_ok must be 1 to 16 characters of 0 and 1";
    letterOk = r.letter_ok;
  }
  return { id, level, item, options, answer, correct, firstTry, hintUsed, responseMs, clientAt, letterOk };
}

export type SummaryRow = { item: string; level: number; correct: boolean; firstTry: boolean; responseMs: number };

export type ItemStat = { item: string; rounds: number; firstTryCorrect: number; accuracy: number; avgMs: number };

export type Summary = {
  attempts: number;
  rounds: number;
  firstTryAccuracy: number | null;
  avgMs: number | null;
  items: ItemStat[];
  weak: ItemStat[];
};

const MIN_ROUNDS_FOR_WEAK = 3;
const WEAK_BELOW = 0.8;

/** Accuracy counts first tries only: one round = one shown item, and a retry after a miss is not a success. */
export function summarize(rows: SummaryRow[]): Summary {
  const by = new Map<string, { rounds: number; ok: number; ms: number }>();
  let rounds = 0, ok = 0, ms = 0;
  for (const r of rows) {
    if (!r.firstTry) continue;
    rounds++;
    if (r.correct) ok++;
    ms += r.responseMs;
    const s = by.get(r.item) ?? { rounds: 0, ok: 0, ms: 0 };
    s.rounds++;
    if (r.correct) s.ok++;
    s.ms += r.responseMs;
    by.set(r.item, s);
  }
  const items: ItemStat[] = [...by.entries()]
    .map(([item, s]) => ({ item, rounds: s.rounds, firstTryCorrect: s.ok, accuracy: s.ok / s.rounds, avgMs: Math.round(s.ms / s.rounds) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.rounds - a.rounds || a.item.localeCompare(b.item));
  return {
    attempts: rows.length,
    rounds,
    firstTryAccuracy: rounds ? ok / rounds : null,
    avgMs: rounds ? Math.round(ms / rounds) : null,
    items,
    weak: items.filter((i) => i.rounds >= MIN_ROUNDS_FOR_WEAK && i.accuracy < WEAK_BELOW).slice(0, 5),
  };
}
