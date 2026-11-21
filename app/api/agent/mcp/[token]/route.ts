import { agentMcpHandler } from "@/lib/agent";

// MCP connector for the place agent: /api/agent/mcp/<agent token>.
// plan_run asks OpenStreetMap for the zone, cafes and exploration (slow mirrors).
export const maxDuration = 120;

type Ctx = RouteContext<"/api/agent/mcp/[token]">;
const handle = async (req: Request, ctx: Ctx) => agentMcpHandler(req, (await ctx.params).token);
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
