// The app applies migrations itself on start (lib/migrate.ts) from a bundled
// copy — it must never drift from prisma/migrations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrations, render } from "../scripts/bundle-migrations";
import { splitStatements } from "../lib/migrate";

test("lib/migrations.generated.ts matches prisma/migrations (run: npm run migrations:bundle)", () => {
  const onDisk = readFileSync(path.join(__dirname, "..", "lib", "migrations.generated.ts"), "utf8");
  assert.equal(onDisk, render(readMigrations()));
});

test("statement splitter keeps statements that start with a comment line", () => {
  const sql = "-- CreateTable\nCREATE TABLE a (x int);\n\n-- only a comment\n;\nCREATE INDEX i ON a(x);";
  assert.deepEqual(splitStatements(sql), ["-- CreateTable\nCREATE TABLE a (x int)", "CREATE INDEX i ON a(x)"]);
});
