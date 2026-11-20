import { mcpHandler } from "@/lib/grocery/mcp";

// Token as "Authorization: Bearer" or ?t= (clients that can set headers).
export const POST = (req: Request) => mcpHandler(req);
export const GET = (req: Request) => mcpHandler(req);
export const DELETE = (req: Request) => mcpHandler(req);
