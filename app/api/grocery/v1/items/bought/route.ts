import { agentApi, body, markForAgent, whoFrom } from "@/domains/grocery";

export const POST = agentApi(async ({ req, agent }) => {
  const b = await body<{ items?: unknown; bought?: unknown; who?: unknown }>(req);
  return markForAgent(b.items, b.bought !== false, whoFrom(b, agent));
});
