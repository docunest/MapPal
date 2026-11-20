import { agentApi, suggestForAgent } from "@/domains/grocery";

export const GET = agentApi(async ({ req }) => suggestForAgent(new URL(req.url).searchParams.get("use_ai") === "true"));
