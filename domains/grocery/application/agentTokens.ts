import { BadRequest } from "../infrastructure/http";
import { ensureReady } from "../infrastructure/seed";
import { issueAgentToken as issue, listAgentTokens as list, revokeAgentToken as revoke } from "../infrastructure/agentTokens";

/** New connector token for an assistant. The token comes back only here — never again. */
export async function issueAgentToken(name: string | undefined, by: string | null) {
  const n = name?.trim().slice(0, 40);
  if (!n) throw new BadRequest("name required");
  await ensureReady();
  return issue(n, by);
}

export async function listAgentTokens() {
  await ensureReady();
  return list();
}

export async function revokeAgentToken(id: string) {
  return revoke(id);
}
