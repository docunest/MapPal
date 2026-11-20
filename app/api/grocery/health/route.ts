import { connection } from "next/server";
import { health } from "@/domains/grocery";

// Public: names of missing settings only, never values.
export async function GET() {
  await connection();
  return Response.json(await health(), { headers: { "Cache-Control": "no-store" } });
}
