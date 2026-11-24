import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { deviceFromToken, readingTokenFrom } from "./auth";

export class BadRequest extends Error {}
export class Unauthorized extends Error {}

const HEADERS = { "Cache-Control": "no-store" };

/** Token check and JSON errors for every reading route. */
export function api(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    await connection();
    try {
      if (!(await deviceFromToken(readingTokenFrom(req)))) throw new Unauthorized("missing, unknown or revoked reading token");
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out, { headers: HEADERS });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof Unauthorized) return Response.json({ error: "Open the reading app with its token (?t=…)." }, { status: 401 });
      if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
      console.error("[reading] api error", err);
      return Response.json({ error: "reading service error" }, { status: 500 });
    }
  };
}

export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequest("JSON body expected");
  }
}
