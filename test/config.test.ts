// Missing server settings are detected — including ones set to "" or
// whitespace (an empty Vercel env var) — and the matching sources switch off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { envChecks } from "../lib/config";
import { envPresent } from "../lib/env";
import { deepseekSource } from "../lib/sources/deepseek";
import { googleSource } from "../lib/sources/google";

test("empty and whitespace-only values count as missing", () => {
  assert.equal(envPresent("X", { X: "" }), false);
  assert.equal(envPresent("X", { X: "   " }), false);
  assert.equal(envPresent("X", {}), false);
  assert.equal(envPresent("X", { X: "abc" }), true);
});

test("the report lists every required and optional setting by name, never values", () => {
  const report = envChecks({ DATABASE_URL: "postgres://secret@host/db", AUTH_SECRET: " ", GOOGLE_MAPS_API_KEY: "" });
  assert.deepEqual(
    report.required.map((c) => [c.name, c.ok]),
    [["DATABASE_URL", true], ["AUTH_SECRET (or NEXTAUTH_SECRET)", false]],
  );
  // The legacy name next-auth also accepts counts too.
  assert.equal(envChecks({ NEXTAUTH_SECRET: "x" }).required[1].ok, true);
  assert.equal(report.optional.find((c) => c.name === "GOOGLE_MAPS_API_KEY")?.ok, false);
  assert.ok(!JSON.stringify(report).includes("secret@host"), "values never leak into the report");
  for (const c of [...report.required, ...report.optional]) assert.ok(c.effect.length > 10, `${c.name} explains its effect`);
});

test("paid sources are off when their key is empty", () => {
  const saved = { g: process.env.GOOGLE_MAPS_API_KEY, d: process.env.DEEPSEEK_API_KEY };
  try {
    process.env.GOOGLE_MAPS_API_KEY = "  ";
    process.env.DEEPSEEK_API_KEY = "";
    assert.equal(googleSource.configured(), false);
    assert.equal(deepseekSource.configured(), false);
    process.env.GOOGLE_MAPS_API_KEY = "key";
    assert.equal(googleSource.configured(), true);
  } finally {
    if (saved.g === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = saved.g;
    if (saved.d === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = saved.d;
  }
});
