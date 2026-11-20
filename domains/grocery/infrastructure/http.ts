import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { memberFrom, requireToken, tokenFrom, Unauthorized } from "./auth";
import { agentFromToken } from "./agentTokens";

export type Ctx = { req: Request; member: string | null };

/** Token check + JSON errors for every API route. */
export function api(fn: (ctx: Ctx) => Promise<unknown>) {
  return async (req: Request) => {
    // Always per request (MapPal runs with cacheComponents: never prerender these).
    await connection();
    try {
      requireToken(req);
      const out = await fn({ req, member: memberFrom(req) });
      return out instanceof Response ? out : Response.json(out, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof Unauthorized) return Response.json({ error: "Open the app from the family link (…/grocery?t=…)." }, { status: 401 });
      if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
      console.error("[grocery] api error", err);
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  };
}

export class BadRequest extends Error {}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new BadRequest("JSON body expected");
  }
}

/**
 * REST for assistants (OpenAPI actions: ChatGPT GPTs, Gemini, scripts). Same
 * per-assistant tokens as MCP — "Authorization: Bearer <token>", "X-API-Key"
 * or ?key= — issued and revoked in the app. The family token is not accepted.
 */
export function agentApi(fn: (ctx: { req: Request; agent: string }) => Promise<unknown>) {
  return async (req: Request) => {
    await connection();
    try {
      const agent = await agentFromToken(tokenFrom(req));
      if (!agent) {
        return Response.json(
          { error: "Unauthorized: use this assistant's API key (Pirkiniai → ⚙️ → Asistentai)" },
          { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
        );
      }
      const out = await fn({ req, agent });
      return out instanceof Response ? out : Response.json(out, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
      console.error("[grocery] agent api error", err);
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  };
}

/** Optional "who" (shown as added/bought by), else the assistant's token name. */
export function whoFrom(body: { who?: unknown }, agent: string): string {
  return typeof body.who === "string" && body.who.trim() ? body.who.trim().slice(0, 40) : agent;
}
