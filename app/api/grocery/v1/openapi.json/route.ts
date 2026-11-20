import { connection } from "next/server";
import { openApiSpec } from "@/domains/grocery";

// Public schema (no secrets) for OpenAPI actions; calls need an assistant API key.
export async function GET(req: Request) {
  await connection();
  return Response.json(openApiSpec(new URL(req.url).origin), {
    headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
}
