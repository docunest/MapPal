import { createHash, timingSafeEqual } from "node:crypto";

// One family token instead of accounts (owner 2026-11-20: "one link, one
// account, then I just enter a username"). The link is /grocery#t=<token>; the app
// keeps it and sends it as "Authorization: Bearer". Only the SHA-256 is in the
// repo. Setting GROCERY_TOKEN on Vercel replaces it.
const DEFAULT_TOKEN_SHA256 = "6974ec0019ac0197755cc7a46b2796735801793c96cd1b63b315e6f537198bf4";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function isFamilyToken(token: string | undefined | null, env: Record<string, string | undefined> = process.env): boolean {
  if (!token) return false;
  const expected = env.GROCERY_TOKEN?.trim() ? sha256(env.GROCERY_TOKEN.trim()) : Buffer.from(DEFAULT_TOKEN_SHA256, "hex");
  return timingSafeEqual(sha256(token.trim()), expected);
}

export function tokenFrom(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return (bearer ?? req.headers.get("x-grocery-token") ?? new URL(req.url).searchParams.get("t") ?? undefined)?.trim();
}

/** Display name of the family member making the call ("x-member" header, set in the app). */
export function memberFrom(req: Request): string | null {
  const raw = req.headers.get("x-member");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().slice(0, 40) || null;
  } catch {
    return raw.trim().slice(0, 40) || null;
  }
}

export class Unauthorized extends Error {}

export function requireToken(req: Request): void {
  if (!isFamilyToken(tokenFrom(req))) throw new Unauthorized("missing or wrong family token");
}
