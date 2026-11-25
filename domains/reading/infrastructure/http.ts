import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AzureUnavailable } from "./azure";

export class BadRequest extends Error {}

// The Ponas game runs on its own origin (tablet: https://skaitymas.appassets.androidplatform.net,
// browser: docunest.github.io), so the answers endpoint answers CORS. No cookies are used.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const HEADERS = { "Cache-Control": "no-store", ...CORS };

/** Answer for the browser's CORS preflight. */
export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * JSON and errors for the reading routes. No token (owner 2026-11-25: the tablet and the family's
 * phones are trusted devices). Who may see the summary is decided by the MapPal login (proxy.ts).
 */
export function api(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    await connection();
    try {
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out, { headers: HEADERS });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400, headers: HEADERS });
      if (err instanceof AzureUnavailable) return Response.json({ error: err.message }, { status: 503, headers: HEADERS });
      console.error("[reading] api error", err);
      return Response.json({ error: "reading service error" }, { status: 500, headers: HEADERS });
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
