// MapPal agent MCP server, Phase 0 (docs/PLAN.md → "Hybrid agent backend —
// Phase 0"). Connector URL: /api/agent/mcp/<agent token> (Claude connectors
// can't add headers). One token per agent (infrastructure/auth.ts).
import { z } from "zod";
import { serveMcp, textResult, type McpContent, type McpResult, type McpServerDef, type McpTool } from "@/lib/mcp/server";
import { reviewsSchema } from "../domain/review";
import { agentFromToken } from "../infrastructure/auth";
import { finishRun, runStatus } from "./finish";
import { RunError } from "./guard";
import { planRun } from "./planRun";
import { fetchImageForAgent, fetchPageForAgent, nextBatch, startRun, submitReviews, type AgentReply } from "./runFlow";
import { getTravelState, travelText } from "./travel";

const INFO = { name: "mappal-agent", title: "MapPal place agent (Phase 0 cost test)", version: "0.1.0" };

const INSTRUCTIONS = `MapPal: a family (two adults, teenagers, a 6-year-old, a dog) living in a camper van in Spain and Portugal. Phase 0 is a COST TEST: check cafes and exploration spots around their latest known location, and log what it costs.
Flow: 1) ask the owner for their Claude weekly usage % (/usage) BEFORE you start; 2) get_travel_state; 3) plan_run = dry run, free; 4) show the plan to the owner and WAIT for a yes; 5) start_run(owner_approved=true); 6) next_batch("cafes") → submit_reviews, repeat; then the same for "exploration"; 7) ask the owner for /usage AFTER; 8) finish_run with both numbers; tell the owner the cost line and the run page link.
Hard rules: the server counts everything it sends you and stops you at the caps ("CAP HIT"): then stop, submit reviews for what you saw, finish_run, report. Never work around a cap. fetch_page/fetch_image only when it changes a verdict or adds a menu/price for a place you keep. Summaries in your own words (don't copy Google review text). Your verdicts are AI output and are shown as such.`;

const runId = { type: "string", description: "Run id from plan_run" };
const reviewsJson = z.toJSONSchema(reviewsSchema) as Record<string, unknown>;

const TOOLS: McpTool[] = [
  { name: "get_travel_state", title: "Where is the family?", description: "Latest known position from any source (car GPS log, car bookmark, link shared from a phone, current stop, Road ahead) and the destinations; says which point plan_run will use and why.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  {
    name: "plan_run",
    title: "Dry run: plan a cost test",
    description: "Free (OpenStreetMap + cache only). Picks the stop zone (campsite + 2–3 towns) from the travel state — or from lat/lng if given — finds cafes and exploration spots, drops obvious misses by rule, skips places reviewed in the last 30 days, and estimates the cost. Creates a run in 'planned' state. Show the result to the owner and wait for a yes.",
    inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, label: { type: "string", description: "Name for a given point" } } },
  },
  { name: "start_run", title: "Start the run (after the owner's yes)", description: "Moves a planned run to running. Only after the owner approved the dry run.", inputSchema: { type: "object", properties: { run_id: runId, owner_approved: { type: "boolean" } }, required: ["run_id", "owner_approved"] } },
  {
    name: "next_batch",
    title: "Next places to judge",
    description: "The next few candidates of a category, best first: a compact fact sheet each (OSM, Google if configured, Wikipedia) and one photo each. Counted against the caps.",
    inputSchema: { type: "object", properties: { run_id: runId, category: { type: "string", enum: ["cafes", "exploration"] } }, required: ["run_id", "category"] },
  },
  { name: "fetch_page", title: "Read a web page (counted)", description: "A page as plain text (≤ 8,000 characters) plus menu links and images found on it. Counts as one page and its tokens. Use for a kept place's menu/prices or a recency check.", inputSchema: { type: "object", properties: { run_id: runId, url: { type: "string" } }, required: ["run_id", "url"] } },
  { name: "fetch_image", title: "Look at one image (counted)", description: "One image by URL (e.g. a menu photo from fetch_page). Counts as one image and its tokens.", inputSchema: { type: "object", properties: { run_id: runId, url: { type: "string" } }, required: ["run_id", "url"] } },
  {
    name: "submit_reviews",
    title: "Save verdicts",
    description: "Your verdicts for places from next_batch (ids like c3, e2): real/fake/stale, confidence, relevant, keep, a short summary in your own words, evidence; plus vibe/availability/food tags/prices for cafes and access/parking/safety for exploration. Re-submitting an id replaces it.",
    inputSchema: { type: "object", properties: { run_id: runId, reviews: reviewsJson }, required: ["run_id", "reviews"] },
  },
  {
    name: "finish_run",
    title: "Finish and log the cost",
    description: "Closes the run, marks the tiles, and returns the cost log with the pass test. Pass the owner's Claude weekly usage % from /usage before and after the run.",
    inputSchema: { type: "object", properties: { run_id: runId, usage_before_pct: { type: "number" }, usage_after_pct: { type: "number" }, model: { type: "string", description: "Model you ran on" }, notes: { type: "string", description: "Yield report: what was worth it, what wasn't and why" } }, required: ["run_id"] },
  },
  { name: "get_run", title: "Cost log so far", description: "The run's counters, kept places and pass test so far.", inputSchema: { type: "object", properties: { run_id: runId }, required: ["run_id"] }, annotations: { readOnlyHint: true } },
];

interface Ctx {
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

async function call(name: string, args: Record<string, unknown>, ctx: Ctx): Promise<McpResult> {
  try {
    switch (name) {
      case "get_travel_state":
        return textResult(travelText(await getTravelState()));
      case "plan_run": {
        const { run, text } = await planRun(ctx.agent, { lat: num(args.lat), lng: num(args.lng), label: typeof args.label === "string" ? args.label : undefined });
        return textResult(`${text}\nRun page: ${ctx.baseUrl}/agent/runs/${run.id}`, { run_id: run.id });
      }
      case "start_run":
        return toResult(await startRun(args.run_id, args.owner_approved));
      case "next_batch":
        return toResult(await nextBatch(args.run_id, args.category));
      case "fetch_page":
        return toResult(await fetchPageForAgent(args.run_id, args.url));
      case "fetch_image":
        return toResult(await fetchImageForAgent(args.run_id, args.url));
      case "submit_reviews":
        return toResult(await submitReviews(args.run_id, args.reviews, ctx.agent));
      case "finish_run": {
        const r = await finishRun(args, ctx.baseUrl);
        return textResult(r.text, r.log);
      }
      case "get_run": {
        const r = await runStatus(args.run_id, ctx.baseUrl);
        return textResult(r.text, r.log);
      }
    }
    return textResult(`Unknown tool ${name}`, undefined, true);
  } catch (err) {
    if (err instanceof RunError) return textResult(err.message, undefined, true);
    throw err;
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const DEF: McpServerDef<Ctx> = { info: INFO, instructions: INSTRUCTIONS, tools: TOOLS, call };

export async function agentMcpHandler(req: Request, token: string | undefined): Promise<Response> {
  const agent = agentFromToken(token);
  const url = new URL(req.url);
  const baseUrl = `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host}`;
  return serveMcp(req, DEF, agent ? { agent, baseUrl } : null);
}

export const AGENT_TOOLS = TOOLS;
