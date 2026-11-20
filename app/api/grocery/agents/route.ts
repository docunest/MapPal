import { api, body, issueAgentToken, listAgentTokens } from "@/domains/grocery";

// MCP connector tokens: list (no secrets) and issue a new one (token shown once).
export const GET = api(async () => ({ agents: await listAgentTokens() }));
export const POST = api(async ({ req, member }) => issueAgentToken((await body<{ name?: string }>(req)).name, member));
