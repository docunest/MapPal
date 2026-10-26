import { NextResponse } from "next/server";
import { timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";

// TEMPORARY bootstrap endpoint: applies migrations from inside the running
// app, for when the Vercel build's own `prisma migrate deploy` step can't
// (e.g. a required env var like DIRECT_URL wasn't set yet for that build).
// Safe to leave in afterwards — it only ever applies a migration once
// (checked against _prisma_migrations, same as the CLI) and does nothing
// once the build-time step is working normally. Remove once confident.
//
// Explicit literal paths (not a directory scan) so Vercel's file-tracing
// reliably bundles these into the serverless function.
const MIGRATIONS: Array<{ name: string; file: string }> = [
  { name: "20261022105458_init_prefixed", file: "20261022105458_init_prefixed/migration.sql" },
  { name: "20261024171028_add_login_token", file: "20261024171028_add_login_token/migration.sql" },
  { name: "20261024194717_category_editing", file: "20261024194717_category_editing/migration.sql" },
  { name: "20261025081754_saved_spots", file: "20261025081754_saved_spots/migration.sql" },
  { name: "20261025093949_nearby_framework", file: "20261025093949_nearby_framework/migration.sql" },
  { name: "20261026120000_dock_items", file: "20261026120000_dock_items/migration.sql" },
];

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-admin-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function splitStatements(sql: string): string[] {
  // A chunk legitimately starts with a "-- Comment" line followed by the
  // real statement (that's valid, executable SQL) — don't filter those out,
  // only drop chunks that are empty or comment-only after stripping comments.
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => {
      const withoutComments = s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return withoutComments.length > 0;
    });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ name: string; status: "applied" | "already-applied" }> = [];

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("id")
      );
    `);

    for (const migration of MIGRATIONS) {
      const existing = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
        migration.name,
      );
      if (Number(existing[0]?.count ?? 0) > 0) {
        results.push({ name: migration.name, status: "already-applied" });
        continue;
      }

      const sql = readFileSync(path.join(process.cwd(), "prisma/migrations", migration.file), "utf-8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      for (const statement of splitStatements(sql)) {
        await prisma.$executeRawUnsafe(statement);
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)`,
        randomUUID(),
        checksum,
        migration.name,
      );
      results.push({ name: migration.name, status: "applied" });
    }
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err), results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results });
}
