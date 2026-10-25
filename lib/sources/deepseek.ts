// DeepSeek: optional AI explanations, written ONLY from the public text a
// shared prompt template hands it (place name, the place's coordinates,
// address, nearby objects, Wikipedia/Wikidata text). Never the family's
// position — see lib/prompts/placeholders.ts. Off unless DEEPSEEK_API_KEY
// is set; capped per day/month like every paid source.
import { envPresent } from "../env";
import type { Source } from "./types";
import { SourceCappedError } from "./types";

const ENDPOINT = "https://api.deepseek.com/chat/completions";
// DeepSeek renames models often; override with DEEPSEEK_MODEL when it does.
const model = () => process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";

export const deepseekSource: Source = {
  meta: {
    id: "deepseek",
    label: "DeepSeek",
    type: "ai",
    cost: "paid",
    ai: true,
    homepage: "https://www.deepseek.com",
    requiresEnv: ["DEEPSEEK_API_KEY"],
    description: "AI explanations written from the public sources only (no personal data sent). Labelled AI.",
    priority: 10,
  },
  configured: () => envPresent("DEEPSEEK_API_KEY"),
  async explain(input, ctx) {
    if (!(await ctx.usage.take("deepseek", "chat"))) {
      throw new SourceCappedError("DeepSeek daily/monthly limit reached");
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY?.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model(),
        messages: [{ role: "user", content: input.prompt }],
        max_tokens: 900,
        stream: false,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${json.error?.message ?? "request failed"}`);
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("DeepSeek returned no text");
    return { text, model: json.model ?? model() };
  },
};
