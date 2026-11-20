// Stage 1 of "say it / type a sentence": a local, free parser. It splits the
// text into chunks, strips filler words and quantities, and matches each chunk
// against the family catalog. Only when something is left that it can't place
// confidently does the server ask DeepSeek (domain/ai.ts).
import { fold, matchPhrase, type CatalogItem } from "./text";

export type ParsedItem = {
  action: "add" | "remove";
  productId: string | null;
  name: string;
  nameEn?: string | null;
  aliases?: string[];
  categoryId: string | null;
  kind: "GROCERY" | "LONGTERM" | null;
  qty: string | null;
  note: string | null;
  heard: string;
  /** Set when the item is an ingredient of a dish the user named ("blynams" → miltai, kiaušiniai…). */
  forDish?: string | null;
  /** known = matched the catalog; new = not in the catalog yet. */
  isNew: boolean;
  confidence: number;
  source: "local" | "ai";
};

export type LocalParse = { items: ParsedItem[]; unsure: string[]; looksLikeSpeech: boolean };

const SPLIT = /\s*(?:[,;\n.!?]+|\s+(?:ir|bei|and|plus|dar|taip pat|also|then|tada)\s+)\s*/i;

// Folded filler words: dropped anywhere in a chunk.
const FILLERS = new Set(
  [
    "reikia", "reikes", "reiktu", "reiketu", "nupirkti", "nusipirkti", "pirkti", "nupirk", "nupirkit", "turim", "turime", "reikia nupirkti",
    "baigesi", "baigiasi", "pasibaige", "nebeturim", "nebeturime", "neturim", "neturime", "nebera", "truksta", "gal", "galbut", "kokiu", "kazkokiu",
    "kazko", "mums", "man", "musu", "dar", "nors", "prasau", "pls", "ok", "gerai", "nu", "na", "tai", "ta", "tu", "kad", "jau", "is", "ka", "kas",
    "we", "need", "needs", "buy", "get", "some", "please", "out", "of", "are", "were", "re", "the", "a", "an", "more", "any", "also", "to",
  ].map(fold),
);

const REMOVE_WORDS = new Set(
  ["nereikia", "nebereikia", "isbraukti", "isbrauk", "istrinti", "istrink", "pasalink", "nebepirkti", "remove", "delete", "dont", "cancel"].map(fold),
);

const NUMBER_WORDS: Record<string, number> = Object.fromEntries(
  Object.entries({
    vienas: 1, viena: 1, viena_: 1, vienu: 1, du: 2, dvi: 2, pora: 2, pora_: 2, trys: 3, tris: 3, keturi: 4, keturis: 4, keturias: 4,
    penki: 5, penkis: 5, penkias: 5, sesi: 6, sesis: 6, sesias: 6, septyni: 7, septynis: 7, astuoni: 8, devyni: 9, desimt: 10,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, couple: 2,
  }).map(([k, v]) => [k.replace(/_$/, ""), v]),
);

const UNITS: [RegExp, string][] = [
  [/^(kg|kilogram\w*|kilo\w*)$/, "kg"],
  [/^(g|gr|gram\w*)$/, "g"],
  [/^(l|ltr|litr\w*|liter\w*)$/, "l"],
  [/^(ml)$/, "ml"],
  [/^(vnt|vienet\w*|pcs|pieces?)$/, "vnt."],
  [/^(pak|pakuot\w*|pakel\w*|packs?|packets?)$/, "pak."],
  [/^(butel\w*|bottles?)$/, "but."],
  [/^(dezut\w*|boxes|box)$/, "dėž."],
  [/^(skardin\w*|cans?|tins?)$/, "sk."],
  [/^(x)$/, ""],
];

function unitOf(word: string): string | null {
  for (const [re, u] of UNITS) if (re.test(word)) return u;
  return null;
}

/** Pull a quantity out of a folded chunk: "du litrus pieno" → ("2 l", "pieno"). */
export function extractQty(chunk: string): { qty: string | null; rest: string } {
  const words = chunk.split(" ").filter(Boolean);
  let qty: string | null = null;
  const rest: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const m = w.match(/^(\d+(?:[.,]\d+)?)([a-z]*)$/);
    const n = m ? m[1].replace(",", ".") : NUMBER_WORDS[w] !== undefined ? String(NUMBER_WORDS[w]) : null;
    if (n !== null && qty === null) {
      let unit = m?.[2] ? unitOf(m[2]) : null;
      if (unit === null && words[i + 1] && unitOf(words[i + 1]) !== null) {
        unit = unitOf(words[i + 1]);
        i++;
      }
      qty = unit ? `${n} ${unit}`.trim() : n;
      continue;
    }
    rest.push(w);
  }
  return { qty, rest: rest.join(" ") };
}

export function splitChunks(text: string): string[] {
  return text
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function looksLikeSpeech(text: string): boolean {
  const words = fold(text).split(" ").filter(Boolean);
  if (words.some((w) => FILLERS.has(w) && w.length > 3)) return true;
  return words.length >= 6;
}

/** Folded word → quantity, or null. Looks at the next word for a unit. */
function qtyAt(words: string[], i: number): { qty: string; used: number } | null {
  const w = words[i];
  const m = w.match(/^(\d+(?:[.,]\d+)?)([a-z]*)$/);
  const n = m ? m[1].replace(",", ".") : NUMBER_WORDS[w] !== undefined ? String(NUMBER_WORDS[w]) : null;
  if (n === null) return null;
  let unit = m?.[2] ? unitOf(m[2]) : null;
  let used = 1;
  if (unit === null && words[i + 1] && unitOf(words[i + 1]) !== null) {
    unit = unitOf(words[i + 1]);
    used = 2;
  }
  return { qty: unit ? `${n} ${unit}`.trim() : n, used };
}

/**
 * Walks the words of each chunk and picks out every known product, so a
 * dictated run-on sentence without commas still works ("kiaušinių du litrus
 * kefyro baigėsi sviestas" → kiaušiniai, kefyras 2 l, sviestas). Words it
 * can't place become a new item (or a note on the next product) and are
 * reported in `unsure`, which is what makes the server ask DeepSeek.
 */
export function parseLocal(text: string, catalog: CatalogItem[]): LocalParse {
  const items: ParsedItem[] = [];
  const unsure: string[] = [];
  for (const rawChunk of splitChunks(text)) {
    const raw = rawChunk.split(/[^\p{L}\p{N}.,]+/u).map((w) => w.replace(/^[.,]+|[.,]+$/g, "")).filter(Boolean);
    const words = raw.map((w) => fold(w).replace(/ /g, ""));
    const isRemove = words.some((w) => REMOVE_WORDS.has(w)) || /\bdon t need\b|\bno more\b/.test(fold(rawChunk));
    const action = isRemove ? "remove" : "add";
    let qty: string | null = null;
    let run: number[] = []; // indexes of words not placed yet
    const flushRun = (attachTo?: ParsedItem) => {
      if (!run.length) return;
      const original = run.map((i) => raw[i]).join(" ");
      const folded = run.map((i) => words[i]).join(" ");
      run = [];
      unsure.push(original);
      if (attachTo) {
        attachTo.note = attachTo.note ? `${original} ${attachTo.note}` : original;
        return;
      }
      const m = matchPhrase(folded, catalog);
      if (m && m.confidence >= 0.7) {
        items.push({ action, productId: m.item.id, name: m.item.name, categoryId: m.item.categoryId, kind: m.item.kind, qty, note: null, heard: original, isNew: false, confidence: m.confidence, source: "local" });
      } else {
        items.push({ action, productId: null, name: original.toLowerCase(), categoryId: null, kind: null, qty, note: null, heard: original, isNew: true, confidence: 0, source: "local" });
      }
      qty = null;
    };
    for (let i = 0; i < words.length; ) {
      const w = words[i];
      if (REMOVE_WORDS.has(w) || FILLERS.has(w)) {
        flushRun();
        i++;
        continue;
      }
      const q = qtyAt(words, i);
      if (q) {
        flushRun();
        qty = q.qty;
        i += q.used;
        continue;
      }
      let matched: { item: CatalogItem; len: number; conf: number } | null = null;
      for (let len = Math.min(4, words.length - i); len >= 1 && !matched; len--) {
        const m = matchPhrase(words.slice(i, i + len).join(" "), catalog);
        if (m && m.confidence >= 0.95) matched = { item: m.item, len, conf: m.confidence };
      }
      if (!matched) {
        run.push(i);
        i++;
        continue;
      }
      const item: ParsedItem = {
        action, productId: matched.item.id, name: matched.item.name, categoryId: matched.item.categoryId, kind: matched.item.kind,
        qty, note: null, heard: raw.slice(i, i + matched.len).join(" "), isNew: false, confidence: matched.conf, source: "local",
      };
      // 1–2 unplaced words right before a product read like a description ("šviežio pieno").
      if (run.length && run.length <= 2) flushRun(item);
      else flushRun();
      items.push(item);
      qty = null;
      i += matched.len;
    }
    flushRun();
  }
  // Same product twice in one sentence → once.
  const seen = new Set<string>();
  const unique = items.filter((it) => !it.productId || (seen.has(it.productId + it.action) ? false : (seen.add(it.productId + it.action), true)));
  return { items: unique, unsure, looksLikeSpeech: looksLikeSpeech(text) };
}
