// DeepSeek client for the scenario agents, with usage tracking (owner,
// 2026-11-06: "use my key, track usage and report when it gets close to the
// end"). Every call records its tokens (SourceUsage rows, sku tokens-in /
// tokens-out) and counts against the "deepseek:agent" call cap; the balance
// comes from DeepSeek's own /user/balance endpoint.
//
// Privacy (docs/DATA-RULES.md → DeepSeek privacy rule): callers send only
// place-level data and the area (country/region) — never the family's
// position, route, saved list or anything about the family.
import { envPresent } from "../env";
import type { UsageGuard } from "../sources/types";
import type { UsageStore } from "../sources/usage";
import { today } from "../sources/usage";

const BASE = "https://api.deepseek.com";
export const deepseekModel = () => process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
export const deepseekConfigured = () => envPresent("DEEPSEEK_API_KEY");

export interface AiResult {
  json: unknown;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface AiClient {
  label: string;
  chatJson(system: string, user: string, opts?: { maxTokens?: number }): Promise<AiResult>;
}

export class AiCappedError extends Error {}

/** Pull the first JSON object out of a reply (models sometimes wrap it in ```json fences). */
export function parseJsonReply(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("AI reply was not JSON");
  }
}

export function deepseekClient(deps: { usage: UsageGuard; store: UsageStore; fetchImpl?: typeof fetch }): AiClient {
  const f = deps.fetchImpl ?? fetch;
  return {
    label: `ai:${deepseekModel()}`,
    async chatJson(system, user, opts = {}) {
      if (!(await deps.usage.take("deepseek", "agent"))) throw new AiCappedError("DeepSeek daily/monthly call cap reached");
      const res = await f(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY?.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: deepseekModel(),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: opts.maxTokens ?? 1500,
          temperature: 0.2,
          stream: false,
        }),
        signal: AbortSignal.timeout(40000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${body.error?.message ?? "request failed"}`);
      const tokensIn = body.usage?.prompt_tokens ?? 0;
      const tokensOut = body.usage?.completion_tokens ?? 0;
      const day = today();
      await Promise.all([
        deps.store.add("deepseek", "tokens-in", day, tokensIn),
        deps.store.add("deepseek", "tokens-out", day, tokensOut),
      ]);
      const text = body.choices?.[0]?.message?.content ?? "";
      return { json: parseJsonReply(text), model: body.model ?? deepseekModel(), tokensIn, tokensOut };
    },
  };
}

export interface DeepseekBalance {
  available: boolean;
  currency?: string;
  total?: number;
  /** Below DEEPSEEK_LOW_BALANCE (default 2 USD / 15 CNY). */
  low: boolean;
  threshold?: number;
  error?: string;
}

export function lowBalanceThreshold(currency: string | undefined, env: Record<string, string | undefined> = process.env) {
  const n = Number(env.DEEPSEEK_LOW_BALANCE);
  if (Number.isFinite(n) && n > 0) return n;
  return currency === "CNY" ? 15 : 2;
}

export async function deepseekBalance(fetchImpl: typeof fetch = fetch): Promise<DeepseekBalance> {
  if (!deepseekConfigured()) return { available: false, low: false, error: "DEEPSEEK_API_KEY not set" };
  try {
    const res = await fetchImpl(`${BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY?.trim()}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      is_available?: boolean;
      balance_infos?: Array<{ currency?: string; total_balance?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) return { available: false, low: false, error: `DeepSeek ${res.status}: ${body.error?.message ?? "balance request failed"}` };
    const info = body.balance_infos?.[0];
    const total = info?.total_balance !== undefined ? Number(info.total_balance) : undefined;
    const threshold = lowBalanceThreshold(info?.currency);
    return {
      available: !!body.is_available,
      currency: info?.currency,
      total,
      threshold,
      low: !body.is_available || (total !== undefined && total < threshold),
    };
  } catch (err) {
    return { available: false, low: false, error: err instanceof Error ? err.message : String(err) };
  }
}
