// Prompt templates: only place-level placeholders exist, so a template
// can't pull in the family's position; DeepSeek gets exactly the rendered
// prompt and nothing else, and stops at its cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATES } from "../lib/prompts/defaults";
import { blocksToText } from "../lib/prompts/context";
import { PLACEHOLDERS, renderPrompt, unknownPlaceholders, type PromptVars } from "../lib/prompts/placeholders";
import { deepseekSource } from "../lib/sources/deepseek";
import { SourceCappedError } from "../lib/sources/types";
import { createUsageGuard, memoryUsageStore } from "../lib/sources/usage";

const vars: PromptVars = {
  "place.name": "Leixões Port",
  "place.local_name": "Porto de Leixões",
  "place.kind": "Port",
  "place.lat": "41.18330",
  "place.lng": "-8.70000",
  "place.address": "Matosinhos, Porto",
  "nearby.objects": "Leça Lighthouse (900 m)",
  "sources.text": "[Wikipedia, en] Port of Leixões\nOne of Portugal's largest seaports.",
  language: "English",
};

test("there is no placeholder for the user's position, route or family", () => {
  for (const name of Object.keys(PLACEHOLDERS)) {
    assert.ok(/^(place\.|nearby\.|sources\.|language$)/.test(name), `unexpected placeholder ${name}`);
  }
  assert.deepEqual(unknownPlaceholders("Hi {{user.lat}} {{route}} {{place.name}}"), ["user.lat", "route"]);
  assert.throws(() => renderPrompt("Where am I? {{user.lat}}", vars), /Unknown placeholder/);
});

test("default templates are valid and render every value", () => {
  for (const t of DEFAULT_TEMPLATES) {
    assert.deepEqual(unknownPlaceholders(t.body), [], t.slug);
    const out = renderPrompt(t.body, vars);
    assert.ok(out.includes("Leixões Port") && out.includes("One of Portugal's largest seaports"), t.slug);
    assert.ok(!/\{\{/.test(out), `${t.slug}: leftover placeholder`);
  }
});

test("source text is built from article + facts blocks", () => {
  const text = blocksToText([
    { id: "a", source: "wikipedia", title: "W", section: { kind: "article", lang: "pt", title: "Porto de Leixões", lead: "Lead.", sections: [{ heading: "História", text: "1884." }] } },
    { id: "f", source: "wikidata", title: "F", section: { kind: "facts", facts: [{ label: "Opened", value: "1892" }] } },
    { id: "p", source: "commons", title: "P", section: { kind: "photos", photos: [] } },
  ]);
  assert.match(text, /\[Wikipedia, pt\] Porto de Leixões\nLead\.\nHistória: 1884\./);
  assert.match(text, /Opened: 1892/);
  assert.ok(!text.includes("photos"));
});

test("DeepSeek gets only the rendered prompt; capped calls never reach the network", async () => {
  const realFetch = globalThis.fetch;
  const sent: Array<{ url: string; body: unknown }> = [];
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ model: "deepseek-flash", choices: [{ message: { content: "It's a big port." } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const store = memoryUsageStore();
    const ctx = { usage: createUsageGuard(store) };
    const prompt = renderPrompt(DEFAULT_TEMPLATES[0].body, vars);
    const out = await deepseekSource.explain!({ prompt, templateSlug: "explain-kid" }, ctx);
    assert.equal(out.text, "It's a big port.");
    assert.equal(sent.length, 1);
    const body = sent[0].body as { messages: Array<{ role: string; content: string }> };
    assert.deepEqual(body.messages, [{ role: "user", content: prompt }]);

    // Exhaust today's cap → refused without a request.
    await store.add("deepseek", "chat", new Date().toISOString().slice(0, 10), 10_000);
    await assert.rejects(deepseekSource.explain!({ prompt, templateSlug: "explain-kid" }, ctx), SourceCappedError);
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.DEEPSEEK_API_KEY;
  }
});
