import { connection } from "next/server";
import { health } from "@/domains/reading";

// GET /api/reading/health → { ok, db, version }. No token, no data.
export async function GET() {
  await connection();
  const h = await health();
  return Response.json(h, { status: h.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
