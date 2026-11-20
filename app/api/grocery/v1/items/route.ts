import { addForAgent, agentApi, body, listForAgent, whoFrom } from "@/domains/grocery";

// REST for assistants (OpenAPI: /api/grocery/v1/openapi.json).
export const GET = agentApi(async ({ req }) => listForAgent(new URL(req.url).searchParams.get("include_bought") !== "false"));
export const POST = agentApi(async ({ req, agent }) => {
  const b = await body<{ text?: unknown; items?: unknown; who?: unknown }>(req);
  return addForAgent(b, whoFrom(b, agent), "mcp");
});
