import { connection } from "next/server";
import { media } from "@/domains/reading";

// A photo or clip by its SHA-256. The content never changes for a hash, so it is cached for a year.
export async function GET(_req: Request, ctx: RouteContext<"/api/reading/media/[hash]">) {
  await connection();
  const { hash } = await ctx.params;
  const m = await media(hash);
  if (!m) return new Response("not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  return new Response(new Uint8Array(m.bytes), { headers: {
    "Content-Type": m.mime, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*",
  } });
}
