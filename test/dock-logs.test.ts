// Dock debug log storage: the 50 MB promise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capBytes, excessBytes, MAX_MSG, ROW_OVERHEAD, rowBytes, rowsFor, TRIM_TO, uploadSchema } from "../lib/dock/logs";

test("default cap leaves room under 50 MB for rows waiting for VACUUM", () => {
  assert.equal(capBytes({}), 35 * 1024 * 1024);
  assert.ok(capBytes({}) * 1.3 < 50 * 1024 * 1024);
  assert.equal(capBytes({ DOCK_LOG_CAP_BYTES: "1000" }), 1000);
  assert.equal(capBytes({ DOCK_LOG_CAP_BYTES: "nonsense" }), 35 * 1024 * 1024);
});

test("nothing is trimmed under the cap; over it, down to 90 %", () => {
  const cap = 1000;
  assert.equal(excessBytes(999, cap), 0);
  assert.equal(excessBytes(1000, cap), 0);
  assert.equal(excessBytes(1200, cap), 1200 - cap * TRIM_TO);
});

test("a row's size counts its text and a fixed overhead; long messages are cut", () => {
  assert.equal(rowBytes("unit", "GPS", "héllo"), 4 + 3 + 6 + ROW_OVERHEAD);
  const [r] = rowsFor("unit", [{ seq: 1, at: 1_762_790_400_000, tag: "WIFI", msg: "x".repeat(MAX_MSG + 50) }]);
  assert.equal(r.msg.length, MAX_MSG + 1);
  assert.equal(r.seq, BigInt(1));
});

test("upload body is validated", () => {
  assert.equal(uploadSchema.safeParse({ device: "d", lines: [{ seq: 1, at: 1, tag: "GPS", msg: "m" }] }).success, true);
  assert.equal(uploadSchema.safeParse({ device: "d", lines: [{ seq: -1, at: 1, tag: "GPS", msg: "m" }] }).success, false);
  assert.equal(uploadSchema.safeParse({ device: "", lines: [] }).success, false);
});
