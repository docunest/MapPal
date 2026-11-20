import { agentApi, finishForAgent, whoFrom } from "@/domains/grocery";

export const POST = agentApi(async ({ req, agent }) => {
  const b = (await req.json().catch(() => ({}))) as { who?: unknown };
  return finishForAgent(whoFrom(b, agent));
});
