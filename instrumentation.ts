// Runs once per server start, before any request is served: bring the
// database schema up to date (see lib/migrate.ts for why the build step
// alone isn't trusted). Never blocks startup on failure — /api/health then
// reports the missing tables by name.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    const { applyPendingMigrations } = await import("./lib/migrate");
    const results = await applyPendingMigrations();
    const applied = results.filter((r) => r.status === "applied").map((r) => r.name);
    if (applied.length) console.log(`[migrate] applied: ${applied.join(", ")}`);
  } catch (err) {
    console.error("[migrate] failed:", err);
  }
}
