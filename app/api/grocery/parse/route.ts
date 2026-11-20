import { api, body, BadRequest } from "@/lib/grocery/http";
import { parseLocal } from "@/lib/grocery/parse";
import { loadCatalog, loadState } from "@/lib/grocery/store";
import { aiConfigured, deepseekChatJson } from "@/lib/grocery/llm/deepseek";
import { parseWithAi } from "@/lib/grocery/llm/ai";

// Sentence / dictation → items. Local parser first (free, instant); DeepSeek
// only when something is left the catalog can't place, and the reply says
// which one did the work ("mode").
export const POST = api(async ({ req }) => {
  const b = await body<{ text?: string; ai?: boolean }>(req);
  const text = b.text?.trim();
  if (!text) throw new BadRequest("text required");
  const [{ products, categories }, state] = await Promise.all([loadCatalog(), loadState()]);
  const local = parseLocal(text, products);
  const needAi = local.unsure.length > 0 || b.ai === true;
  if (needAi && b.ai !== false && aiConfigured()) {
    try {
      const items = await parseWithAi(text, { catalog: products, categories, listNames: state.entries.filter((e) => e.status === "OPEN").map((e) => e.name) }, deepseekChatJson);
      return { mode: "ai", items, unsure: local.unsure };
    } catch (err) {
      return { mode: "local", items: local.items, unsure: local.unsure, aiError: err instanceof Error ? err.message : String(err) };
    }
  }
  return { mode: "local", items: local.items, unsure: local.unsure, aiAvailable: aiConfigured() };
});
