// MapPal agent connector (MCP, and the same tools over REST at
// /api/agent/v1/<tool>). Token per agent (infrastructure/auth.ts).
// Pipeline: preview_briefs → owner's yes → get_briefs (every task at once) →
// submit_results → finish_run. Rules (charter, output format, use cases) are
// read and changed here too; every change is a stored version.
import { z } from "zod";
import { serveMcp, textResult, type McpContent, type McpResult, type McpServerDef, type McpTool } from "@/lib/mcp/server";
import { reviewsSchema } from "../domain/review";
import { nodeSchema } from "../domain/profile";
import { buildUseCaseTree } from "../domain/tree";
import { agentFromToken } from "../infrastructure/auth";
import { newCorrelationId } from "../infrastructure/events";
import { indexArea } from "../infrastructure/osmIndex";
import { currentRule, listRules, restoreRule, ruleHistory, RuleError, saveRule } from "../infrastructure/rules";
import { previewBriefs, pullBriefs, submitResults, type BriefArgs } from "./briefs";
import { finishRun, runStatus } from "./finish";
import { RunError } from "./guard";
import { fetchImageForAgent, fetchPageForAgent, type AgentReply } from "./runFlow";
import { getTravelState, setLocation, travelText } from "./travel";

const INFO = { name: "mappal-agent", title: "MapPal place agent", version: "0.3.0" };

const INSTRUCTIONS = `MapPal checks places for a family living in a camper van in Spain and Portugal. You judge; the server does the free work (place index, rules, location) and counts what you cost.
Flow: 1) ask the owner for their Claude weekly usage % (/usage); note the time. 2) get_travel_state — check the location hints; set_location if the owner says otherwise. 3) preview_briefs (free) — show it to the owner, WAIT for a yes. 4) get_briefs(owner_approved=true) — every brief at once: charter, output format, location, then per use case its rules, the known places (never return those) and the places to judge. 5) submit_results per brief. 6) ask for /usage again; run the skill's usage.mjs --since <time>; finish_run with both. Tell the owner the cost line and the pull page.
"More" in the same area = just call preview_briefs/get_briefs again: places already judged are excluded automatically.
Rules: get_rules, rule_history, update_rule (stored as a new version with your note; the owner can restore any version), restore_rule.
The server stops you at caps ("CAP HIT"): stop, submit what you have, finish_run. Your verdicts are AI output and are shown as such.`;

const runId = { type: "string", description: "Pull id (run_…) from get_briefs" };
const where = {
  lat: { type: "number" },
  lng: { type: "number" },
  label: { type: "string", description: "Name for a given point" },
  use_cases: { type: "array", items: { type: "string" }, description: "Default: all use cases (get_rules lists the tree). A group (e.g. food) means all its use cases (cafes, bars, restaurants, fast-food)." },
  page_size: { type: "number", description: "Places per use case (default from its rules)" },
};

const TOOLS: McpTool[] = [
  { name: "get_travel_state", title: "Where is the family?", description: "Best guess of the family's position from every hint (car GPS log, car route requests, car bookmarks, links shared from a phone, the owner's pin, stops), each hint with its weight and whether it was used; destinations; the target briefs will use.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "set_location", title: "Pin where the family is", description: "Record the position the owner told you (outranks every other hint). Returns the new travel state.", inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, label: { type: "string" } }, required: ["lat", "lng"] } },
  { name: "index_area", title: "Fill the place index", description: "Reads OpenStreetMap for missing or stale (> 30 days) cells (≈ 30 × 20 km) within radius_km, nearest first, ~90 s per call. Free. Call again until 0 missing. refresh=true re-reads fresh cells too.", inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, radius_km: { type: "number" }, refresh: { type: "boolean" } } } },
  { name: "preview_briefs", title: "Preview (free)", description: "What a pull would contain: zone, per use case how many places are in the index, dropped by the rules, already known, on this page, left for later; layer versions and hashes. Nothing is spent. Show to the owner and wait for a yes.", inputSchema: { type: "object", properties: where } },
  { name: "get_briefs", title: "Get every brief at once", description: "After the owner's yes: the full tasks — shared layers once (charter, output format, location), then per use case: its rules, the known places (negative list), the places to judge with facts and one photo each. Counted against the caps. Same arguments as preview_briefs.", inputSchema: { type: "object", properties: { ...where, owner_approved: { type: "boolean" } }, required: ["owner_approved"] } },
  { name: "submit_results", title: "Submit verdicts for a brief", description: "Results for places of one brief (ids like c3, e2), in the output-format layer's shape, ≤ 20 per call. Re-submitting an id replaces it.", inputSchema: { type: "object", properties: { brief_id: { type: "string" }, results: z.toJSONSchema(reviewsSchema) as Record<string, unknown> }, required: ["brief_id", "results"] } },
  { name: "fetch_page", title: "Read a web page (counted)", description: "A page as plain text (≤ 8,000 characters) plus menu links and images. Counts as one page and its tokens.", inputSchema: { type: "object", properties: { run_id: runId, url: { type: "string" } }, required: ["run_id", "url"] } },
  { name: "fetch_image", title: "Look at one image (counted)", description: "One image by URL (e.g. a menu photo). Counts as one image and its tokens.", inputSchema: { type: "object", properties: { run_id: runId, url: { type: "string" } }, required: ["run_id", "url"] } },
  {
    name: "finish_run",
    title: "Finish the pull and log the cost",
    description: "Closes the pull and returns the measured cost log: tokens served, Claude's own tokens (from usage.mjs), the owner's /usage % before and after.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: runId,
        usage_before_pct: { type: "number" },
        usage_after_pct: { type: "number" },
        claude_input_tokens: { type: "number" },
        claude_output_tokens: { type: "number" },
        claude_cache_read_tokens: { type: "number" },
        claude_cache_write_tokens: { type: "number" },
        model: { type: "string" },
        notes: { type: "string", description: "Yield report: what was worth it, what wasn't and why (a rule to change?)" },
      },
      required: ["run_id"],
    },
  },
  { name: "get_run", title: "Cost log so far", description: "A pull's counters, kept places and pass test so far.", inputSchema: { type: "object", properties: { run_id: runId }, required: ["run_id"] }, annotations: { readOnlyHint: true } },
  { name: "get_rules", title: "Read the rules", description: "Without slug: every layer (charter, output-format, usecase:<name>) with its current version and hash. Use cases are a tree (food → cafes, bars…); a child inherits what it leaves out and its drop/score rules come after its parents'. With slug: its full text and, for a use case, its own rules as JSON (select / drop / score …, parent).", inputSchema: { type: "object", properties: { slug: { type: "string" } } }, annotations: { readOnlyHint: true } },
  { name: "rule_history", title: "Rule versions", description: "Every version of one layer: number, hash, who, when, why.", inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] }, annotations: { readOnlyHint: true } },
  {
    name: "update_rule",
    title: "Change a rule (new version)",
    description: "Saves a new version of a layer — body (the text) and, for a use case, config (the JSON rules, the whole object; see get_rules for the current one and its format). A new slug usecase:<name> adds a use case; set config.parent to put it under another (it inherits area, layers, page size, text and drop/score rules). No select = a group. note (why) is required. Takes effect for the next preview; the owner can restore any version.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, body: { type: "string" }, config: z.toJSONSchema(nodeSchema, { io: "input" }) as Record<string, unknown>, title: { type: "string" }, note: { type: "string" } }, required: ["slug", "note"] },
  },
  { name: "restore_rule", title: "Restore a rule version", description: "Makes an earlier version current again (saved as a new version).", inputSchema: { type: "object", properties: { slug: { type: "string" }, version: { type: "number" } }, required: ["slug", "version"] } },
];

export interface AgentCtx {
  agent: string;
  baseUrl: string;
}

function toResult(r: AgentReply): McpResult {
  const content: McpContent[] = [];
  for (const im of r.images ?? []) {
    if (im.before) content.push({ type: "text", text: im.before });
    content.push({ type: "image", data: im.image.base64, mimeType: im.image.mimeType });
  }
  if (r.text) content.push({ type: "text", text: r.text });
  return { content, isError: false };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const briefArgs = (a: Record<string, unknown>): BriefArgs => ({
  lat: num(a.lat),
  lng: num(a.lng),
  label: typeof a.label === "string" ? a.label : undefined,
  use_cases: Array.isArray(a.use_cases) ? a.use_cases.filter((x): x is string => typeof x === "string") : undefined,
  page_size: num(a.page_size),
});

export async function callAgentTool(name: string, args: Record<string, unknown>, ctx: AgentCtx): Promise<McpResult> {
  try {
    switch (name) {
      case "get_travel_state":
        return textResult(travelText(await getTravelState()));
      case "set_location":
        return textResult(await setLocation(args));
      case "index_area": {
        let lat = num(args.lat);
        let lng = num(args.lng);
        if (lat === undefined || lng === undefined) {
          const s = await getTravelState();
          if (!s.target) return textResult("No location known: pass lat/lng.", undefined, true);
          ({ lat, lng } = s.target);
        }
        const radius = Math.min(150, Math.max(1, num(args.radius_km) ?? 30));
        const id = newCorrelationId();
        const p = await indexArea({ lat, lng }, radius, id, 90_000, args.refresh === true);
        return textResult(
          `Index ${radius} km around ${lat.toFixed(4)},${lng.toFixed(4)} (job ${id}): ${p.cells} cells — ${p.fresh.length} already fresh, ${p.fetched.length} fetched now (${p.fetched.reduce((s, r) => s + r.count, 0)} places), ${p.failed.length} failed${p.failed.length ? ` (${p.failed.map((f) => `${f.cell}: ${f.error}`).join("; ")})` : ""}, ${p.missing.length} still missing${p.missing.length ? " — call index_area again" : ""}.`,
          { job: id, cells: p.cells, fresh: p.fresh.length, fetched: p.fetched.length, failed: p.failed.length, missing: p.missing.length },
        );
      }
      case "preview_briefs": {
        const r = await previewBriefs(briefArgs(args));
        return textResult(r.text, { preview: r.runId });
      }
      case "get_briefs":
        return toResult(await pullBriefs({ ...briefArgs(args), owner_approved: args.owner_approved }, ctx.agent, ctx.baseUrl));
      case "submit_results":
        return toResult(await submitResults(args.brief_id, args.results, ctx.agent));
      case "fetch_page":
        return toResult(await fetchPageForAgent(args.run_id, args.url));
      case "fetch_image":
        return toResult(await fetchImageForAgent(args.run_id, args.url));
      case "finish_run": {
        const r = await finishRun(args, ctx.baseUrl);
        return textResult(r.text, r.log);
      }
      case "get_run": {
        const r = await runStatus(args.run_id, ctx.baseUrl);
        return textResult(r.text, r.log);
      }
      case "get_rules": {
        if (typeof args.slug === "string" && args.slug) {
          const r = await currentRule(args.slug);
          return textResult(`${r.slug} v${r.version} · ${r.hash} (by ${r.createdBy}, ${r.createdAt.slice(0, 16)}${r.note ? `: ${r.note}` : ""})\n\n${r.body}${r.config ? `\n\nconfig:\n${JSON.stringify(r.config, null, 1)}` : ""}`, r);
        }
        const all = await listRules();
        const tree = buildUseCaseTree(all.filter((r) => r.layer === "usecase"));
        const line = (r: (typeof all)[number], depth = 0) => `${"  ".repeat(depth)}${r.slug} — ${r.title} — v${r.version} · ${r.hash} (by ${r.createdBy})`;
        const lines = [...all.filter((r) => r.layer !== "usecase").map((r) => line(r)), "use cases (tree):", ...tree.map((e) => `${line(e.item, e.depth + 1)}${e.runs ? "" : " [group]"}`)];
        return textResult(lines.join("\n"), { rules: all.map((r) => ({ slug: r.slug, layer: r.layer, title: r.title, parent: r.config?.parent ?? null, version: r.version, hash: r.hash, createdBy: r.createdBy, note: r.note, createdAt: r.createdAt })) });
      }
      case "rule_history": {
        const h = await ruleHistory(String(args.slug ?? ""));
        return textResult(h.versions.map((v) => `${v.version === h.current ? "→" : " "} v${v.version} · ${v.hash} · ${v.createdBy} · ${v.createdAt.slice(0, 16)} · ${v.note ?? ""}`).join("\n"), h);
      }
      case "update_rule": {
        const r = await saveRule(String(args.slug ?? ""), { body: typeof args.body === "string" ? args.body : undefined, config: args.config, title: typeof args.title === "string" ? args.title : undefined }, `agent:${ctx.agent}`, String(args.note ?? ""));
        return textResult(`Saved ${r.slug} v${r.version} · ${r.hash}. It applies from the next preview_briefs.`, { slug: r.slug, version: r.version, hash: r.hash });
      }
      case "restore_rule": {
        const r = await restoreRule(String(args.slug ?? ""), Number(args.version), `agent:${ctx.agent}`);
        return textResult(`${r.slug} is now v${r.version} (a copy of v${args.version}) · ${r.hash}.`);
      }
    }
    return textResult(`Unknown tool ${name}`, undefined, true);
  } catch (err) {
    if (err instanceof RunError || err instanceof RuleError) return textResult(err.message, undefined, true);
    throw err;
  }
}

const DEF: McpServerDef<AgentCtx> = { info: INFO, instructions: INSTRUCTIONS, tools: TOOLS, call: callAgentTool };

export function baseUrlOf(req: Request) {
  const url = new URL(req.url);
  return `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host}`;
}

export async function agentMcpHandler(req: Request, token: string | undefined): Promise<Response> {
  const agent = await agentFromToken(token);
  return serveMcp(req, DEF, agent ? { agent, baseUrl: baseUrlOf(req) } : null);
}

/** REST twin: POST /api/agent/v1/<tool> with the tool's arguments as JSON; Authorization: Bearer <token>. */
export async function agentRestHandler(req: Request, tool: string): Promise<Response> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? undefined;
  const agent = await agentFromToken(token);
  if (!agent) return Response.json({ error: "Unauthorized: Authorization: Bearer <agent token>" }, { status: 401 });
  if (!TOOLS.some((t) => t.name === tool)) return Response.json({ error: `Unknown tool ${tool}`, tools: TOOLS.map((t) => t.name) }, { status: 404 });
  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return Response.json(await callAgentTool(tool, args, { agent, baseUrl: baseUrlOf(req) }), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const AGENT_TOOLS = TOOLS;
