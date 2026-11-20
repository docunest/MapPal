// DeepSeek account balance (shared MapPal helper, DeepSeek's own /user/balance)
// plus this module's usage against its cap "deepseek:grocery".
import { deepseekBalance } from "@/lib/ai/deepseek";
import { capFor, today } from "@/lib/sources/usage";
import { dbUsageStore } from "@/lib/sources/usageDb";
import { aiConfigured, aiModel } from "../infrastructure/deepseek";

export async function aiStatus() {
  const day = today();
  const cap = capFor("deepseek", "grocery");
  const [balance, todayCalls, monthCalls] = await Promise.all([
    aiConfigured() ? deepseekBalance() : Promise.resolve(null),
    dbUsageStore.monthTotal("deepseek", "grocery", day), // prefix = the whole day
    dbUsageStore.monthTotal("deepseek", "grocery", day.slice(0, 7)),
  ]);
  return {
    configured: aiConfigured(),
    model: aiModel(),
    balance: balance && { available: balance.available, currency: balance.currency ?? null, total: balance.total ?? null, low: balance.low, error: balance.error ?? null },
    today: { calls: todayCalls, cap: cap.daily },
    month: { calls: monthCalls, cap: cap.monthly },
  };
}
