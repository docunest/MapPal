// Applies pending migrations from inside the running app. The build's
// `prisma migrate deploy` is the normal path, but on Vercel it silently didn't
// reach the runtime database (2026-10-26: tables from two deploys missing), so
// every server start also makes sure the schema is current before serving
// (instrumentation.ts). Same bookkeeping as the Prisma CLI (_prisma_migrations,
// sha256 checksum), so the two never disagree about what's applied.
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { MIGRATIONS } from "./migrations.generated";

export type MigrationResult = { name: string; status: "applied" | "already-applied" };

// Any constant: all app instances agree on it, so only one migrates at a time.
const LOCK_KEY = 7_311_942_001;

// "Already exists" — the object is there (e.g. created by an earlier, unrecorded
// run). Skipping it makes a half-applied migration finishable.
const ALREADY_EXISTS = new Set(["42P07", "42710", "42701", "42P06", "42723", "42P16"]);

export function splitStatements(sql: string): string[] {
  // A chunk legitimately starts with a "-- Comment" line followed by the real
  // statement — only drop chunks that are empty or comment-only.
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    );
}

function pgCode(err: unknown): string | undefined {
  const meta = (err as { meta?: { code?: string } })?.meta;
  return meta?.code ?? String(err).match(/Code: `(\w{5})`/)?.[1];
}

async function applyOne(tx: Prisma.TransactionClient, sql: string) {
  for (const statement of splitStatements(sql)) {
    await tx.$executeRawUnsafe("SAVEPOINT stmt");
    try {
      await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT stmt");
    } catch (err) {
      if (!ALREADY_EXISTS.has(pgCode(err) ?? "")) throw err;
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT stmt");
    }
  }
}

export async function applyPendingMigrations(): Promise<MigrationResult[]> {
  return prisma.$transaction(
    async (tx) => {
      // Transaction-scoped lock: works through Supabase's transaction pooler.
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
      await tx.$executeRawUnsafe(`
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
        )`);
      const done = await tx.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      const applied = new Set(done.map((r) => r.migration_name));
      const results: MigrationResult[] = [];
      for (const m of MIGRATIONS) {
        if (applied.has(m.name)) {
          results.push({ name: m.name, status: "already-applied" });
          continue;
        }
        await applyOne(tx, m.sql);
        await tx.$executeRawUnsafe(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, now(), 1)`,
          randomUUID(),
          createHash("sha256").update(m.sql).digest("hex"),
          m.name,
        );
        results.push({ name: m.name, status: "applied" });
      }
      return results;
    },
    { maxWait: 20_000, timeout: 120_000 },
  );
}
