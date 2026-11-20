// Minimal MCP server (Streamable HTTP transport, JSON responses, no SSE):
// enough for Claude (custom connector) and ChatGPT (developer-mode connector)
// to read and change the same list the phones use. The token is in the URL
// (/api/grocery/mcp/<agent token>) because those connectors can't send custom
// headers. Each agent has its own token, issued and revoked in the app
// (infrastructure/agentTokens.ts).
import { autocomplete, matchPhrase, type CatalogItem } from "../domain/text";
import type { EntryDto } from "../domain/types";
import { tokenFrom } from "../infrastructure/auth";
import { agentFromToken } from "../infrastructure/agentTokens";
import { aiConfigured } from "../infrastructure/deepseek";
import { loadCatalog, loadState } from "../infrastructure/repo";
import { addItems, type AddRequest } from "./addItems";
import { classifyNew } from "./classifyNew";
import { finishTrip } from "./finishTrip";
import { parseText } from "./parseText";
import { suggestFromHistory } from "./suggestFromHistory";
import { suggestWithAi } from "./suggestWithAi";
import { updateEntry } from "./updateEntry";

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

async function listText(includeBought = true) {
  const { entries, categories, trip } = await loadState();
  const cat = new Map(categories.map((c) => [c.id, c]));
  const shown = entries.filter((e) => includeBought || e.status === "OPEN");
  const lines: string[] = [];
  for (const kind of ["GROCERY", "LONGTERM"] as const) {
    const part = shown.filter((e) => e.kind === kind);
    if (!part.length) continue;
    lines.push(kind === "GROCERY" ? "## Groceries" : "## Long-term (buy when possible)");
    for (const c of categories) {
      const inCat = part.filter((e) => e.categoryId === c.id);
      if (!inCat.length) continue;
      lines.push(`${c.emoji} ${c.nameLt} / ${c.nameEn}`);
      for (const e of inCat) lines.push(`- [${e.status === "BOUGHT" ? "x" : " "}] ${e.name}${e.qty ? ` × ${e.qty}` : ""}${e.note ? ` (${e.note})` : ""}  {id:${e.id}}`);
    }
  }
  const open = shown.filter((e) => e.status === "OPEN").length;
  const head = `${open} to buy${trip ? `, shopping trip in progress since ${trip.startedAt}` : ""}.`;
  return {
    text: [head, ...lines].join("\n") || "The list is empty.",
    structured: { trip, items: shown.map((e) => ({ ...e, section: cat.get(e.categoryId)?.nameEn })) },
  };
}

function findEntries(refs: string[], entries: EntryDto[], products: CatalogItem[]): { hit: EntryDto[]; missing: string[] } {
  // Match against the product's English name and aliases too ("potatoes" → bulvės).
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const asCatalog: CatalogItem[] = entries.map((e) => {
    const p = e.productId ? byProduct.get(e.productId) : undefined;
    return { id: e.id, name: e.name, nameEn: p?.nameEn, aliases: p?.aliases ?? [], categoryId: e.categoryId, kind: e.kind };
  });
  const hit: EntryDto[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    const byId = entries.find((e) => e.id === ref);
    const m = byId ? null : matchPhrase(ref, asCatalog);
    const e = byId ?? (m && m.confidence >= 0.6 ? entries.find((x) => x.id === m.item.id) : undefined);
    if (e) hit.push(e);
    else missing.push(ref);
  }
  return { hit, missing };
}

async function callTool(name: string, args: Json, agent: string) {
  const who = typeof args.who === "string" && args.who.trim() ? args.who.trim().slice(0, 40) : agent;
  switch (name) {
    case "get_list": {
      const r = await listText(args.include_bought !== false);
      return text(r.text, r.structured);
    }
    case "add_items": {
      const { products } = await loadCatalog();
      const input: AddRequest[] = [];
      let mode = "local";
      if (typeof args.text === "string" && args.text.trim()) {
        const parsed = await parseText(args.text);
        mode = parsed.mode;
        input.push(...parsed.items.map((i) => ({ ...i, categoryId: i.categoryId ?? null })));
      }
      if (Array.isArray(args.items)) {
        for (const it of args.items as Json[]) {
          if (typeof it.name !== "string") continue;
          const m = matchPhrase(it.name, products);
          input.push({
            name: it.name,
            productId: m && m.confidence >= 0.75 ? m.item.id : null,
            qty: typeof it.qty === "string" ? it.qty : null,
            note: typeof it.note === "string" ? it.note : null,
            kind: it.long_term === true ? "LONGTERM" : null,
            categoryId: it.long_term === true ? "ilgalaikiai" : null,
          });
        }
      }
      const { results, removed, toClassify } = await addItems(input, who, "mcp");
      if (toClassify.length) await classifyNew(toClassify);
      const lines = results.map((r) => `${r.merged ? "already on list" : "added"}: ${r.entry.name}${r.entry.qty ? ` × ${r.entry.qty}` : ""}${r.createdProduct ? " (new product)" : ""}`);
      if (removed) lines.push(`removed ${removed}`);
      return text(`${lines.join("\n") || "Nothing recognised."}\n(parsed: ${mode})`, { results: results.map((r) => r.entry), removed, parsedBy: mode });
    }
    case "mark_bought":
    case "remove_items": {
      const refs = Array.isArray(args.items) ? (args.items as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const [{ entries }, { products }] = await Promise.all([loadState(), loadCatalog()]);
      const { hit, missing } = findEntries(refs, entries, products);
      const status = name === "remove_items" ? "REMOVED" : args.bought === false ? "OPEN" : "BOUGHT";
      for (const e of hit) await updateEntry(e.id, { status }, who);
      const verb = status === "REMOVED" ? "removed" : status === "BOUGHT" ? "crossed out" : "back to buy";
      return text(`${verb}: ${hit.map((e) => e.name).join(", ") || "nothing"}${missing.length ? `\nnot on the list: ${missing.join(", ")}` : ""}`, { done: hit.map((e) => e.id), missing });
    }
    case "finish_shopping": {
      const r = await finishTrip(who);
      return text(`Trip finished: ${r.bought} bought. ${r.carried} groceries stay on the list for next time, ${r.longTerm} long-term.`, r);
    }
    case "suggest_items": {
      if (args.use_ai === true && aiConfigured()) {
        const r = await suggestWithAi();
        return text(r.items.map((i) => `- ${i.name}: ${i.reason}`).join("\n") + (r.tips.length ? `\n${r.tips.join("\n")}` : ""), r);
      }
      const { suggestions } = await suggestFromHistory();
      const lines = suggestions.map((s) =>
        s.reason === "due" ? `- ${s.name} (every ~${s.intervalDays} d, last ${s.daysSince} d ago)` : s.reason === "staple" ? `- ${s.name} (staple)` : `- ${s.name} (bought ${s.daysSince} d ago)`,
      );
      return text(lines.join("\n") || "Nothing due right now.", { suggestions, source: "history" });
    }
    case "search_catalog": {
      const { products, categories } = await loadCatalog();
      const cat = new Map(categories.map((c) => [c.id, c]));
      const hits = autocomplete(String(args.query ?? ""), products, 10);
      return text(
        hits.map((h) => `- ${h.item.name}${h.item.nameEn ? ` / ${h.item.nameEn}` : ""} — ${cat.get(h.item.categoryId)?.nameEn}${h.item.aliases.length ? ` (also: ${h.item.aliases.join(", ")})` : ""}`).join("\n") || "No match.",
        { products: hits.map((h) => h.item) },
      );
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

