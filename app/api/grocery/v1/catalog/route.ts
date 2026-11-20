import { agentApi, searchCatalogForAgent } from "@/domains/grocery";

export const GET = agentApi(async ({ req }) => searchCatalogForAgent(new URL(req.url).searchParams.get("q") ?? ""));
