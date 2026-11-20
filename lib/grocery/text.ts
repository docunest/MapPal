// Text matching shared by the phone (instant autocomplete, no network) and
// the server (sentence parsing before any AI is asked). Lithuanian-aware:
// diacritics are folded (kiausiniai = kiaušiniai) and a light stemmer strips
// case endings (pieno / pienas / pienu → pien).

export type CatalogItem = {
  id: string;
  name: string;
  nameEn?: string | null;
  aliases: string[];
  categoryId: string;
  kind: "GROCERY" | "LONGTERM";
  staple?: boolean;
  /** Times it was put on the list. */
  uses?: number;
  /** Last time it was put on the list (ISO). */
  lastUsedAt?: string | null;
};

export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Longest first. Lithuanian noun/adjective endings (folded) + English plural.
const ENDINGS = [
  "iuose", "uose", "iams", "iems", "ioms", "iais", "iose", "ems", "ams", "oms", "ais", "ius", "iai", "iui", "iam", "ies",
  "ias", "ios", "iu", "ia", "io", "as", "is", "ys", "us", "os", "es", "ai", "ei", "ui", "u", "a", "e", "i", "o", "y", "s",
];

export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  for (const end of ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 3) return word.slice(0, -end.length);
  }
  return word;
}

export const tokens = (s: string) => fold(s).split(" ").filter(Boolean);
export const stems = (s: string) => tokens(s).map(stem);

function variants(p: CatalogItem): { text: string; primary: boolean }[] {
  const out = [{ text: p.name, primary: true }];
  if (p.nameEn) out.push({ text: p.nameEn, primary: false });
  for (const a of p.aliases) out.push({ text: a, primary: false });
  return out;
}

export type Suggestion = { item: CatalogItem; score: number; via: string | null };

const DAY = 86_400_000;

function popularity(p: CatalogItem, now: number): number {
  let s = Math.min(30, (p.uses ?? 0) * 3);
  if (p.lastUsedAt && now - Date.parse(p.lastUsedAt) < 30 * DAY) s += 5;
  if (p.staple) s += 3;
  return s;
}

/** How well a typed prefix matches one name (0 = not at all). */
function prefixScore(q: string, qTokens: string[], text: string): number {
  const t = fold(text);
  if (!t) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 100;
  const words = t.split(" ");
  if (words.some((w) => w.startsWith(q))) return 70;
  if (qTokens.length > 1 && qTokens.every((qt) => words.some((w) => w.startsWith(qt)))) return 60;
  if (qTokens.length === 1 && q.length >= 4) {
    const qs = stem(q);
    if (words.some((w) => stem(w) === qs || (qs.length >= 4 && w.startsWith(qs)))) return 55;
  }
  if (q.length >= 3 && t.includes(q)) return 30;
  return 0;
}

/** Autocomplete: best catalog items for what has been typed so far. */
export function autocomplete(query: string, catalog: CatalogItem[], limit = 8, now = Date.now()): Suggestion[] {
  const q = fold(query);
  if (!q) return [];
  const qTokens = q.split(" ");
  const out: Suggestion[] = [];
  for (const p of catalog) {
    let best = 0;
    let via: string | null = null;
    for (const v of variants(p)) {
      const s = prefixScore(q, qTokens, v.text) + (v.primary ? 5 : 0);
      if (s > best) {
        best = s;
        via = v.primary ? null : v.text;
      }
    }
    if (best > 5) out.push({ item: p, score: best + popularity(p, now), via });
  }
  return out.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "lt")).slice(0, limit);
}

export type PhraseMatch = { item: CatalogItem; confidence: number };

/** Find the catalog item a whole phrase refers to ("šviežio pieno" → pienas). */
export function matchPhrase(phrase: string, catalog: CatalogItem[]): PhraseMatch | null {
  const f = fold(phrase);
  if (!f) return null;
  const pStems = f.split(" ").map(stem);
  let best: PhraseMatch | null = null;
  const consider = (item: CatalogItem, confidence: number) => {
    if (!best || confidence > best.confidence || (confidence === best.confidence && (item.uses ?? 0) > (best.item.uses ?? 0))) {
      best = { item, confidence };
    }
  };
  for (const p of catalog) {
    for (const v of variants(p)) {
      const vf = fold(v.text);
      if (!vf) continue;
      if (vf === f) {
        consider(p, 1);
        continue;
      }
      const vStems = vf.split(" ").map(stem);
      const hit = vStems.filter((s) => pStems.includes(s)).length;
      if (hit === vStems.length && hit === pStems.length) consider(p, 0.95);
      else if (hit === vStems.length) consider(p, 0.6 + 0.3 * (hit / pStems.length)); // phrase says more than the name (adjective, brand)
      else if (pStems.length === 1 && pStems[0].length >= 4 && vStems.some((s) => s.startsWith(pStems[0]) && s.length - pStems[0].length <= 3)) {
        consider(p, 0.7);
      }
    }
  }
  return best;
}
