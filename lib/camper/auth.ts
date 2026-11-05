import { createHash, timingSafeEqual } from "node:crypto";
import { auth } from "@/auth";
import { tokenFrom } from "@/lib/dock/auth";

// The repo is public and this token controls a diesel heater, so only its
// SHA-256 is committed (unlike the dock token). The token itself lives on the
// Z1 (camper.env) and in the owner's /camper link. CAMPER_TOKEN on Vercel
// replaces it.
const DEFAULT_TOKEN_SHA256 = "c59a3ff050c8880a46a68d53feca8d93f01136aedeefcd64e9c4e64eee8f07de";
// Separate token for the owner's browser link (/camper#t=<token>), so it can be
// replaced without touching the Z1's camper.env. Generated 2026-11-05.
const LINK_TOKEN_SHA256 = "aa26d1b42e8199ee758bd526bdeee8857abcde0b4cceed9756711e4fd8608b3b";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function isCamperToken(token: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!token) return false;
  const expected = env.CAMPER_TOKEN?.trim() ? sha256(env.CAMPER_TOKEN.trim()) : Buffer.from(DEFAULT_TOKEN_SHA256, "hex");
  const got = sha256(token);
  return timingSafeEqual(got, expected) || timingSafeEqual(got, Buffer.from(LINK_TOKEN_SHA256, "hex"));
}

/** "device"/"link" for a token holder, the user's name for a logged-in session, null otherwise. */
export async function camperCaller(req: Request): Promise<string | null> {
  if (isCamperToken(tokenFrom(req))) return "token";
  const session = await auth();
  return session?.user ? (session.user.name ?? session.user.email ?? "web") : null;
}
