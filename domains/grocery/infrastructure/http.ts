import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { memberFrom, requireToken, Unauthorized } from "./auth";

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
