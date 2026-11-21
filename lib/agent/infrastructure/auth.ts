// Agent tokens (docunest hard rules §5: one token per agent, revocable
// alone). Issued on /agent/tokens and kept only as SHA-256 in
// mappal_agent_token. MAPPAL_AGENT_TOKENS on Vercel ("name:sha256hex,…") can
// add more. The token posted in chat on 2026-11-21 was never in the table and
// its hash is no longer in the code, so it no longer works.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const sha256hex = (s: string) => createHash("sha256").update(s.trim()).digest("hex");

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

/** The agent's name for a token from the env list, null otherwise. */
export function agentFromEnvToken(token: string | undefined | null, env: Record<string, string | undefined> = process.env): string | null {
  if (!token || token.length < 20) return null;
  const got = createHash("sha256").update(token.trim()).digest();
  for (const t of parseTokenList(env.MAPPAL_AGENT_TOKENS ?? "")) if (timingSafeEqual(got, t.hash)) return t.name;
  return null;
}

/** Env list first, then the issued tokens. */
export async function agentFromToken(token: string | undefined | null): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const fromEnv = agentFromEnvToken(token);
  if (fromEnv) return fromEnv;
  const row = await prisma.agentToken.findUnique({ where: { hash: sha256hex(token) } }).catch(() => null);
  if (!row || row.revokedAt) return null;
  void prisma.agentToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return row.name;
}

export async function issueToken(name: string) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) throw new Error("name required");
  const token = randomBytes(24).toString("base64url");
  const row = await prisma.agentToken.create({ data: { name: clean, hash: sha256hex(token) } });
  return { id: row.id, name: row.name, token };
}

export const listTokens = () => prisma.agentToken.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true } });

export const revokeToken = (id: string) => prisma.agentToken.update({ where: { id }, data: { revokedAt: new Date() } });
