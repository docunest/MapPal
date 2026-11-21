// Shared kernel (docunest hard rules §3, core): a minimal MCP server over
// Streamable HTTP — JSON responses, no SSE — enough for Claude (custom
// connector, Claude Code) and ChatGPT. Each app brings its tools and its own
// per-agent token check; this file only speaks the protocol.
export interface McpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export type McpContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface McpResult {
  content: McpContent[];
  structuredContent?: unknown;
  isError: boolean;
}

export interface McpServerDef<C> {
  info: { name: string; title: string; version: string };
  instructions: string;
  tools: McpTool[];
  call(name: string, args: Record<string, unknown>, ctx: C): Promise<McpResult>;
}

// Some clients (Claude Code) show only structuredContent when it's there, so it carries the text too.
export const textResult = (t: string, structured?: unknown, isError = false): McpResult => ({
  content: [{ type: "text", text: t }],
  ...(structured !== undefined ? { structuredContent: structured && typeof structured === "object" && !Array.isArray(structured) ? { text: t, ...(structured as Record<string, unknown>) } : { text: t, data: structured } } : {}),
  isError,
});

type Json = Record<string, unknown>;
type RpcMsg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

async function handleOne<C>(msg: RpcMsg, def: McpServerDef<C>, ctx: C): Promise<Json | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  try {
    switch (msg.method) {
      case "initialize": {
        const requested = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18";
        return reply({ protocolVersion: requested, capabilities: { tools: { listChanged: false } }, serverInfo: def.info, instructions: def.instructions });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: def.tools });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const args = (msg.params?.arguments ?? {}) as Json;
        if (!def.tools.some((t) => t.name === name)) return reply(textResult(`Unknown tool ${name}`, undefined, true));
        try {
          return reply(await def.call(name, args, ctx));
        } catch (err) {
          return reply(textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, undefined, true));
        }
      }
      case "resources/list":
        return reply({ resources: [] });
      case "prompts/list":
        return reply({ prompts: [] });
      default:
        if (isNotification) return null;
        return error(-32601, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    return error(-32603, err instanceof Error ? err.message : String(err));
  }
}

/** `ctx` null = the caller's token was refused (the app checked it). */
export async function serveMcp<C>(req: Request, def: McpServerDef<C>, ctx: C | null, unauthorized = "Unauthorized: use this agent's connector URL"): Promise<Response> {
  if (ctx === null) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: unauthorized } }, { status: 401 });
  if (req.method === "GET") return new Response("This MCP server answers POST only (no SSE stream).", { status: 405, headers: { Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const msgs = (Array.isArray(payload) ? payload : [payload]) as RpcMsg[];
  const out = (await Promise.all(msgs.map((m) => handleOne(m, def, ctx)))).filter((r): r is Json => r !== null);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}
