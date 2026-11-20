// MCP connector tokens (docunest hard rules §5: one per assistant/integration,
// revocable alone). Stored as SHA-256 only; the token itself is returned once,
// when it is issued. Managed from the app (⚙️ → Asistentai).
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sha256 } from "./auth";

export type AgentTokenDto = { id: string; name: string; createdAt: string; createdBy: string | null; lastUsedAt: string | null; revokedAt: string | null };

const toDto = (t: Awaited<ReturnType<typeof prisma.groceryAgentToken.findFirstOrThrow>>): AgentTokenDto => ({
  id: t.id,
  name: t.name,
  createdAt: t.createdAt.toISOString(),
  createdBy: t.createdBy,
  lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  revokedAt: t.revokedAt?.toISOString() ?? null,
});

export async function issueAgentToken(name: string, by: string | null): Promise<{ token: string; agent: AgentTokenDto }> {
  const token = randomBytes(18).toString("base64url");
  const row = await prisma.groceryAgentToken.create({ data: { name, tokenHash: sha256(token).toString("hex"), createdBy: by } });
  return { token, agent: toDto(row) };
}

export async function listAgentTokens(): Promise<AgentTokenDto[]> {
  const rows = await prisma.groceryAgentToken.findMany({ orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] });
  return rows.map(toDto);
}

export async function revokeAgentToken(id: string): Promise<AgentTokenDto | null> {
  const row = await prisma.groceryAgentToken.findUnique({ where: { id } });
  if (!row) return null;
  return toDto(row.revokedAt ? row : await prisma.groceryAgentToken.update({ where: { id }, data: { revokedAt: new Date() } }));
}

/** Agent name for an active token (and note when it was last used), or null. */
export async function agentFromToken(token: string | undefined | null): Promise<string | null> {
  if (!token?.trim()) return null;
  const row = await prisma.groceryAgentToken.findUnique({ where: { tokenHash: sha256(token.trim()).toString("hex") } });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.groceryAgentToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return row.name;
}
