import { timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";

/**
 * The phone's share shortcut and the head unit hold DOCK_INBOX_TOKEN instead
 * of a login (neither can do the login screen). Accepted as
 * "Authorization: Bearer <token>", "x-dock-token: <token>" or "?token=" —
 * the last one because some share-shortcut apps can't set headers.
 * A logged-in browser session (the /dock page) works too.
 */
export function tokenFrom(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return (bearer ?? req.headers.get("x-dock-token") ?? new URL(req.url).searchParams.get("token") ?? undefined)?.trim();
}

// Owner's call (2 users, a few weeks): a fixed token committed here so it
// works with no server setup. Setting DOCK_INBOX_TOKEN on Vercel replaces it
// (then put the same value in the phone shortcut and the head-unit app).
export const DEFAULT_DOCK_TOKEN = "b76a9d1d8c4afa58012625e1920abbca";

export function isDockToken(token: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const expected = env.DOCK_INBOX_TOKEN?.trim() || DEFAULT_DOCK_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Who is calling, or null if nobody we know. */
export async function dockCaller(req: Request): Promise<string | null> {
  if (isDockToken(tokenFrom(req))) return "token";
  const session = await auth();
  return session?.user ? (session.user.name ?? session.user.email ?? "web") : null;
}
