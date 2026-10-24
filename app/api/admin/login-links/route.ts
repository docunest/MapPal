import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const mintSchema = z.object({
  email: z.string().email(),
});

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return false;

  const provided = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mints a single-use, 30-day magic-login link for an existing user. Redeem
// at GET /api/magic-login?token=... — see that route for the sign-in side.
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = mintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ error: "No user with that email" }, { status: 404 });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  await prisma.loginToken.create({ data: { token, userId: user.id, expiresAt } });

  const url = new URL("/api/magic-login", req.url);
  url.searchParams.set("token", token);

  return NextResponse.json({ ok: true, url: url.toString(), expiresAt });
}
