import { agentApi, body, removeForAgent, whoFrom } from "@/domains/grocery";

export const POST = agentApi(async ({ req, agent }) => {
  const b = await body<{ items?: unknown; who?: unknown }>(req);
  return removeForAgent(b.items, whoFrom(b, agent));
});
