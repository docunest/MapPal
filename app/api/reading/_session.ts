import { auth } from "@/auth";

/** Parent routes: the normal MapPal login (proxy.ts sends visitors without a session to /login). */
export async function loggedIn(): Promise<Response | null> {
  return (await auth()) ? null : Response.json({ error: "Prisijunk prie MapPal." }, { status: 401 });
}
export const origin = (req: Request) => new URL(req.url).origin;
export const jsonOf = async (req: Request) => ((await req.json().catch(() => ({}))) as Record<string, unknown>);
