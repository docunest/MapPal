import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAttempt, summarize } from "../domain/attempt";

const good = { id: "abcd1234-ok", level: 1, item: "ma", options: ["ma", "na", "pa"], answer: "ma", correct: true, first_try: true, hint_used: false, response_ms: 1200, at: "2026-11-24T10:00:00Z" };

test("parseAttempt accepts a game attempt and converts to camel case", () => {
  const a = parseAttempt(good);
  assert.equal(typeof a, "object");
  if (typeof a === "object") { assert.equal(a.firstTry, true); assert.equal(a.clientAt, "2026-11-24T10:00:00.000Z"); }
});

test("parseAttempt rejects bad fields with a clear message", () => {
  assert.match(parseAttempt({ ...good, level: 9 }) as string, /level/);
  assert.match(parseAttempt({ ...good, options: [] }) as string, /options/);
  assert.match(parseAttempt({ ...good, options: Array(10).fill("x") }) as string, /options/);
  assert.match(parseAttempt({ ...good, response_ms: -1 }) as string, /response_ms/);
  assert.match(parseAttempt({ ...good, correct: "yes" }) as string, /true or false/);
  assert.match(parseAttempt({ ...good, id: "x" }) as string, /id/);
  assert.match(parseAttempt(null) as string, /object/);
});

test("summarize counts first tries only and sorts weakest first", () => {
  const rows = [
    { item: "ma", level: 1, correct: true, firstTry: true, responseMs: 1000 },
    { item: "ma", level: 1, correct: false, firstTry: true, responseMs: 2000 },
    { item: "ma", level: 1, correct: true, firstTry: false, responseMs: 500 },
    { item: "pa", level: 1, correct: true, firstTry: true, responseMs: 900 },
    { item: "pa", level: 1, correct: true, firstTry: true, responseMs: 900 },
    { item: "pa", level: 1, correct: true, firstTry: true, responseMs: 900 },
    { item: "ba", level: 1, correct: false, firstTry: true, responseMs: 3000 },
    { item: "ba", level: 1, correct: false, firstTry: true, responseMs: 3000 },
    { item: "ba", level: 1, correct: false, firstTry: true, responseMs: 3000 },
  ];
  const s = summarize(rows);
  assert.equal(s.attempts, 9);
  assert.equal(s.rounds, 8);
  assert.equal(s.firstTryAccuracy, 4 / 8);
  assert.equal(s.items[0].item, "ba");
  assert.deepEqual(s.weak.map((w) => w.item), ["ba"]);   // ma has only 2 rounds, so not judged yet
});

test("summarize on no data gives nulls, not zeros", () => {
  const s = summarize([]);
  assert.equal(s.firstTryAccuracy, null);
  assert.equal(s.avgMs, null);
  assert.deepEqual(s.weak, []);
});

import { readingTokenOk } from "../infrastructure/auth";

test("reading API refuses everything unless READING_TOKEN is set and matches", () => {
  assert.equal(readingTokenOk("anything", {}), false);                       // no token configured: closed
  assert.equal(readingTokenOk(undefined, { READING_TOKEN: "s3cret-token" }), false);
  assert.equal(readingTokenOk("wrong-token", { READING_TOKEN: "s3cret-token" }), false);
  assert.equal(readingTokenOk("s3cret-token", { READING_TOKEN: "s3cret-token" }), true);
});
