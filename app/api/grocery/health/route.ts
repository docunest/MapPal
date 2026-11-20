import { connection } from "next/server";
import { aiConfigured, aiModel } from "@/lib/grocery/llm/deepseek";
import { ensureReady } from "@/lib/grocery/seed";

// Public: names of missing settings only, never values.
export async function GET() {
  await connection();
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
  return Response.json({ db, ai: aiConfigured() ? aiModel() : "off (DEEPSEEK_API_KEY not set)", missing });
}
