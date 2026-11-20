// Minimal MCP server (Streamable HTTP transport, JSON responses, no SSE):
// enough for Claude (custom connector) and ChatGPT (developer-mode connector)
// to read and change the same list the phones use. The token is in the URL
// (/api/grocery/mcp/<agent token>) because those connectors can't send custom
// headers. Each agent has its own token, issued and revoked in the app
// (infrastructure/agentTokens.ts).
import { tokenFrom } from "../infrastructure/auth";
import { agentFromToken } from "../infrastructure/agentTokens";
import { addForAgent, finishForAgent, listForAgent, markForAgent, removeForAgent, searchCatalogForAgent, suggestForAgent } from "./agentActions";

const SERVER = { name: "grocery-list", title: "Family grocery list (Pirkiniai)", version: "1.0.0" };

const INSTRUCTIONS = `Shared family grocery list (Lithuanian names, English understood).
Groceries are bought on every supermarket trip; LONGTERM items (heater, tools, clothes) wait until there is a chance.
Use add_items with free text (any language; it is matched against the family catalog, unknown things are classified).
The list is grouped in supermarket aisle order. Items not bought stay on the list for the next trip.`;

const TOOLS = [
  {
    name: "get_list",
    title: "Show the shopping list",
    description: "Current list grouped by supermarket section (aisle order), groceries and long-term separately. Shows what is already crossed out on the current trip.",
    inputSchema: { type: "object", properties: { include_bought: { type: "boolean", description: "Also list items already crossed out on the current trip (default true)" } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_items",
    title: "Add to the list",
    description: "Add things to buy. Pass free text exactly as the user said it (e.g. 'pieno, du kepalus duonos ir portable heater') — it is parsed, matched to the family catalog and classified. Or pass items[] with explicit names.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Free text / dictation, any language" },
        items: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" }, qty: { type: "string" }, note: { type: "string" }, long_term: { type: "boolean" } }, required: ["name"] },
        },
        who: { type: "string", description: "Family member name to show as 'added by' (optional)" },
      },
    },
  },
  {
    name: "mark_bought",
    title: "Cross out / un-cross",
    description: "Mark items on the list as bought (crossed out) — or not bought again with bought=false. Items by name (any language) or id.",
    inputSchema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "string" } }, bought: { type: "boolean" }, who: { type: "string" } },
      required: ["items"],
    },
  },
  {
    name: "remove_items",
    title: "Remove from the list",
    description: "Take items off the list (not needed any more). By name or id.",
    inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"] },
    annotations: { destructiveHint: true },
  },
  {
    name: "finish_shopping",
    title: "Finish the shopping trip",
    description: "End the current trip: crossed-out items go to history (they teach the 'usually buy' suggestions); everything not bought stays on the list.",
    inputSchema: { type: "object", properties: { who: { type: "string" } } },
  },
  {
    name: "suggest_items",
    title: "What do we usually need?",
    description: "Shortlist of products the family is probably due to buy (from their own purchase rhythm), not yet on the list. use_ai=true asks DeepSeek to refine it.",
    inputSchema: { type: "object", properties: { use_ai: { type: "boolean" } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_catalog",
    title: "Search the family catalog",
    description: "Find known products (names, aliases, section) — e.g. to check how the family calls something.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    annotations: { readOnlyHint: true },
  },
];

type Json = Record<string, unknown>;
type RpcMsg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

const text = (t: string, structured?: unknown, isError = false) => ({
  content: [{ type: "text", text: t }],
  ...(structured !== undefined ? { structuredContent: structured } : {}),
  isError,
});

async function callTool(name: string, args: Json, agent: string) {
  const who = typeof args.who === "string" && args.who.trim() ? args.who.trim().slice(0, 40) : agent;
  switch (name) {
    case "get_list": {
      const r = await listForAgent(args.include_bought !== false);
      const lines: string[] = [`${r.toBuy} to buy${r.trip ? `, shopping trip in progress since ${r.trip.startedAt}` : ""}.`];
      let section = "";
      let longTerm = false;
      for (const it of r.items) {
        if (it.longTerm && !longTerm) {
          longTerm = true;
          section = "";
          lines.push("## Long-term (buy when possible)");
        }
        if (it.section !== section) {
          section = it.section;
          lines.push(`${it.sectionLt} / ${it.section}`);
        }
        lines.push(`- [${it.bought ? "x" : " "}] ${it.name}${it.qty ? ` × ${it.qty}` : ""}${it.note ? ` (${it.note})` : ""}  {id:${it.id}}`);
      }
      return text(r.items.length ? lines.join("\n") : "The list is empty.", r);
    }
    case "add_items": {
      const r = await addForAgent(args, who, "mcp");
      const lines = [
        ...r.added.map((a) => `added: ${a.name}${a.qty ? ` × ${a.qty}` : ""}${a.newProduct ? " (new product)" : ""}`),
        ...r.alreadyOnList.map((a) => `already on list: ${a.name}${a.qty ? ` × ${a.qty}` : ""}`),
      ];
      if (r.removed) lines.push(`removed ${r.removed}`);
      return text(`${lines.join("\n") || "Nothing recognised."}\n(parsed: ${r.parsedBy})`, r);
    }
    case "mark_bought": {
      const bought = args.bought !== false;
      const r = await markForAgent(args.items, bought, who);
      return text(`${bought ? "crossed out" : "back to buy"}: ${r.done.map((e) => e.name).join(", ") || "nothing"}${r.notOnList.length ? `\nnot on the list: ${r.notOnList.join(", ")}` : ""}`, r);
    }
    case "remove_items": {
      const r = await removeForAgent(args.items, who);
      return text(`removed: ${r.removed.map((e) => e.name).join(", ") || "nothing"}${r.notOnList.length ? `\nnot on the list: ${r.notOnList.join(", ")}` : ""}`, r);
    }
    case "finish_shopping": {
      const r = await finishForAgent(who);
      return text(`Trip finished: ${r.bought} bought. ${r.stayOnList} groceries stay on the list for next time, ${r.longTerm} long-term.`, r);
    }
    case "suggest_items": {
      const r = await suggestForAgent(args.use_ai === true);
      return text((r.items.map((i) => `- ${i.name} (${i.reason})`).join("\n") || "Nothing due right now.") + (r.tips.length ? `\n${r.tips.join("\n")}` : ""), r);
    }
    case "search_catalog": {
      const r = await searchCatalogForAgent(String(args.query ?? ""));
      return text(r.products.map((p) => `- ${p.name}${p.nameEn ? ` / ${p.nameEn}` : ""} — ${p.section}${p.aliases.length ? ` (also: ${p.aliases.join(", ")})` : ""}`).join("\n") || "No match.", r);
    }
  }
  return text(`Unknown tool ${name}`, undefined, true);
}

async function handleOne(msg: RpcMsg, agent: string): Promise<Json | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  try {
    switch (msg.method) {
      case "initialize": {
        const requested = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18";
        return reply({ protocolVersion: requested, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const args = (msg.params?.arguments ?? {}) as Json;
        try {
          return reply(await callTool(name, args, agent));
        } catch (err) {
          return reply(text(`Error: ${err instanceof Error ? err.message : String(err)}`, undefined, true));
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

export async function mcpHandler(req: Request, pathToken?: string): Promise<Response> {
  // Agent tokens only (one per agent, revocable alone) — not the family token.
  const agent = await agentFromToken(pathToken ?? tokenFrom(req));
  if (!agent) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: use this agent's connector URL" } }, { status: 401 });
  }
  if (req.method === "GET") return new Response("This MCP server answers POST only (no SSE stream).", { status: 405, headers: { Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const msgs = (Array.isArray(payload) ? payload : [payload]) as RpcMsg[];
  const out = (await Promise.all(msgs.map((m) => handleOne(m, agent)))).filter((r): r is Json => r !== null);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}

