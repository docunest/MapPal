import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAttempt, summarize } from "../domain/attempt";

const good = { id: "abcd1234-ok", level: 1, item: "ma", options: ["ma", "na", "pa"], answer: "ma", correct: true, first_try: true, hint_used: false, response_ms: 1200, at: "2026-11-24T10:00:00Z" };

test("parseAttempt accepts a game attempt and converts to camel case", () => {
  const a = parseAttempt(good);
  assert.equal(typeof a, "object");
  if (typeof a === "object") { assert.equal(a.firstTry, true); assert.equal(a.clientAt, "2026-11-24T10:00:00.000Z"); }
});

test("parseAttempt takes every level the game has, word levels without options, and per-letter results", () => {
  for (const level of [1, 2, 3, 11, 12, 13, 14, 15]) assert.equal(typeof parseAttempt({ ...good, level }), "object");
  const w = parseAttempt({ ...good, level: 3, item: "medis", options: [], answer: "medis", letter_ok: "11011" });
  assert.equal(typeof w, "object");
  if (typeof w === "object") { assert.deepEqual(w.options, []); assert.equal(w.letterOk, "11011"); }
  const plain = parseAttempt(good);
  if (typeof plain === "object") assert.equal(plain.letterOk, null);
});

test("parseAttempt rejects bad fields with a clear message", () => {
  assert.match(parseAttempt({ ...good, level: 0 }) as string, /level/);
  assert.match(parseAttempt({ ...good, level: 100 }) as string, /level/);
  assert.match(parseAttempt({ ...good, options: Array(33).fill("x") }) as string, /options/);
  assert.match(parseAttempt({ ...good, letter_ok: "12" }) as string, /letter_ok/);
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

import { newToken, tokenHash } from "../domain/device";

test("device tokens are random, long and never stored as given", () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40);
  assert.notEqual(tokenHash(a), a);
  assert.equal(tokenHash(a), tokenHash(` ${a} `));           // whitespace around a pasted token is ignored
  assert.match(tokenHash(a), /^[0-9a-f]{64}$/);
});
