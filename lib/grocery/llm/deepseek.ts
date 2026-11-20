// DeepSeek (OpenAI-compatible chat API), same key as MapPal. Every call is
// logged in grocery_ai_call (purpose, tokens, ok/error) and counted against a
// daily cap (GROCERY_AI_DAILY_CAP, default 200). Only list/product text is
// sent — never family names or locations.
import { prisma } from "../../db";

const BASE = "https://api.deepseek.com";
export const aiModel = () => process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
export const aiConfigured = () => !!process.env.DEEPSEEK_API_KEY?.trim();
const dailyCap = () => Number(process.env.GROCERY_AI_DAILY_CAP) || 200;

export class AiUnavailable extends Error {}

export type ChatJson = (purpose: string, system: string, user: string, opts?: { maxTokens?: number }) => Promise<unknown>;

export function parseJsonReply(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("AI reply was not JSON");
  }
}

export async function aiCallsToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return prisma.groceryAiCall.count({ where: { at: { gte: start } } });
}

export const deepseekChatJson: ChatJson = async (purpose, system, user, opts = {}) => {
  if (!aiConfigured()) throw new AiUnavailable("DEEPSEEK_API_KEY not set");
  if ((await aiCallsToday()) >= dailyCap()) throw new AiUnavailable("daily AI cap reached");
  const model = aiModel();
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        max_tokens: opts.maxTokens ?? 2000,
        temperature: 0.1,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    tokensIn = body.usage?.prompt_tokens ?? 0;
    tokensOut = body.usage?.completion_tokens ?? 0;
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${body.error?.message ?? "request failed"}`);
    const json = parseJsonReply(body.choices?.[0]?.message?.content ?? "");
    await prisma.groceryAiCall.create({ data: { purpose, model, tokensIn, tokensOut, ok: true } });
    return json;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.groceryAiCall.create({ data: { purpose, model, tokensIn, tokensOut, ok: false, error: msg.slice(0, 500) } }).catch(() => {});
    throw err;
  }
};
