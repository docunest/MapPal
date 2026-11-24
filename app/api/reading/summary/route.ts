import { auth } from "@/auth";
import { api, getSummary } from "@/domains/reading";

// Behind the normal MapPal login (proxy.ts sends visitors without a session to /login).
// Checked here too, so the data never depends on the proxy alone.
const summary = api(async (req) => getSummary(new URL(req.url).searchParams));

export async function GET(req: Request) {
  if (!(await auth())) return Response.json({ error: "Log in to MapPal first." }, { status: 401 });
  return summary(req);
}
