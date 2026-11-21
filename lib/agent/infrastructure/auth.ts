// Agent tokens (docunest hard rules §5: one token per agent, revocable
// alone). Only SHA-256 hashes are in git. MAPPAL_AGENT_TOKENS on Vercel
// ("name:sha256hex,name2:sha256hex") replaces the default list; an empty
// value turns the connector off.
import { createHash, timingSafeEqual } from "node:crypto";

// "claude": the owner's Claude Code connector, generated 2026-11-21.
const DEFAULT_TOKENS = "claude:b7173e7912a1a344c39b864217877c31540b01223fb1ad7171689d79ed6595dc";

export function parseTokenList(list: string): Array<{ name: string; hash: Buffer }> {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, hex] = s.split(":");
      return { name: name?.trim(), hash: Buffer.from(hex?.trim() ?? "", "hex") };
    })
    .filter((t) => t.name && t.hash.length === 32);
}

/** The agent's name for a valid token, null otherwise. */
export function agentFromToken(token: string | undefined | null, env: Record<string, string | undefined> = process.env): string | null {
  if (!token || token.length < 20) return null;
  const list = parseTokenList(env.MAPPAL_AGENT_TOKENS ?? DEFAULT_TOKENS);
  const got = createHash("sha256").update(token.trim()).digest();
  for (const t of list) if (timingSafeEqual(got, t.hash)) return t.name;
  return null;
}
