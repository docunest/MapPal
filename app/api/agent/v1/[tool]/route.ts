import { agentRestHandler } from "@/lib/agent";

// REST twin of the agent connector: POST /api/agent/v1/<tool>, JSON arguments, Authorization: Bearer <agent token>.
export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/agent/v1/[tool]">) {
  return agentRestHandler(req, (await ctx.params).tool);
}
