import { aiConfigured, aiModel } from "../infrastructure/deepseek";
import { ensureReady } from "../infrastructure/seed";

/** Names of missing settings only, never values. */
export async function health() {
  const missing = process.env.DATABASE_URL?.trim() ? [] : ["DATABASE_URL"];
  let db = "not configured";
  if (!missing.length) {
    try {
      await ensureReady();
      db = "ok";
    } catch (err) {
      db = `error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
    }
  }
  return { ok: db === "ok", db, ai: aiConfigured() ? aiModel() : "off (DEEPSEEK_API_KEY not set)", missing };
}
