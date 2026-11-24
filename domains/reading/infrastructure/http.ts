import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { readingTokenFrom, tokenOk } from "./auth";

export class BadRequest extends Error {}
export class Unauthorized extends Error {}

// The Ponas game runs on its own origin (tablet: https://skaitymas.appassets.androidplatform.net,
// browser: docunest.github.io). Auth is a bearer token, never a cookie, so any origin may call.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const HEADERS = { "Cache-Control": "no-store", ...CORS };

/** Answer for the browser's CORS preflight. */
export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Token check and JSON errors for every reading route. */
export function api(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    await connection();
    try {
      if (!(await tokenOk(readingTokenFrom(req)))) throw new Unauthorized("missing or wrong reading token");
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out, { headers: HEADERS });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof Unauthorized) return Response.json({ error: "Open the reading app with its token (?t=…)." }, { status: 401, headers: HEADERS });
      if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400, headers: HEADERS });
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

/** Same scheme as /api/admin: x-admin-secret must equal ADMIN_SEED_SECRET. Unset secret = closed. */
export function isAdminRequest(req: Request): boolean {
  const expected = process.env.ADMIN_SEED_SECRET?.trim();
  if (!expected) return false;
  const a = Buffer.from(req.headers.get("x-admin-secret") ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Private admin routes (x-admin-secret = ADMIN_SEED_SECRET, fail closed). */
export function adminApi(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    await connection();
    try {
      if (!isAdminRequest(req)) return Response.json({ error: "admin secret required" }, { status: 401 });
      const out = await fn(req);
      return out instanceof Response ? out : Response.json(out, { headers: HEADERS });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
      console.error("[reading] admin error", err);
      return Response.json({ error: "reading admin error" }, { status: 500 });
    }
  };
}
