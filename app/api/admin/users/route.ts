import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";

const upsertSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SEED_SECRET;
  // Fail closed: an unset secret must never be treated as "no auth required".
  if (!expected) return false;

  const provided = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Bootstraps/updates a family login without needing DATABASE_URL outside
// Vercel's own env — the app already holds that connection. Guarded by a
// separate ADMIN_SEED_SECRET env var (set in Vercel, never in this repo).
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email },
      update: { name, passwordHash },
      create: { email, name, passwordHash },
    });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }

  // Never echo back password/hash, even on success.
  return NextResponse.json({ ok: true, email });
}
