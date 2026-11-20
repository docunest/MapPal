import { mcpHandler } from "@/lib/grocery/mcp";

// Connector URL with the token in the path: /api/grocery/mcp/<token>
// (Claude / ChatGPT custom connectors can't add headers).
type Ctx = RouteContext<"/api/grocery/mcp/[token]">;
const handle = async (req: Request, ctx: Ctx) => mcpHandler(req, (await ctx.params).token);
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
