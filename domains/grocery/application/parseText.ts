// Sentence / dictation → items. Local parser first (free, instant); DeepSeek
// only when something is left the catalog can't place, and the reply says
// which one did the work ("mode": local | ai).
import { parseWithAi } from "../domain/ai";
import { parseLocal, type ParsedItem } from "../domain/parse";
import { aiConfigured, deepseekChatJson } from "../infrastructure/deepseek";
import { loadCatalog, loadState } from "../infrastructure/repo";

export type ParseResult = { mode: "local" | "ai"; items: ParsedItem[]; unsure: string[]; aiAvailable?: boolean; aiError?: string };

export async function parseText(text: string, opts: { ai?: boolean } = {}): Promise<ParseResult> {
  const [{ products, categories }, state] = await Promise.all([loadCatalog(), loadState()]);
  const local = parseLocal(text, products);
  const needAi = local.unsure.length > 0 || opts.ai === true;
  if (needAi && opts.ai !== false && aiConfigured()) {
    try {
      const listNames = state.entries.filter((e) => e.status === "OPEN").map((e) => e.name);
      const items = await parseWithAi(text, { catalog: products, categories, listNames }, deepseekChatJson);
      return { mode: "ai", items, unsure: local.unsure };
    } catch (err) {
      return { mode: "local", items: local.items, unsure: local.unsure, aiError: err instanceof Error ? err.message : String(err) };
    }
  }
  return { mode: "local", items: local.items, unsure: local.unsure, aiAvailable: aiConfigured() };
}
