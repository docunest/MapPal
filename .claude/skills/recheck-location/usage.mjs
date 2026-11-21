#!/usr/bin/env node
// Claude's own token use in this Claude Code session, from its transcript
// (~/.claude/projects/<project>/<session>.jsonl): every assistant message
// carries its usage. Prints JSON for finish_run.
//   node usage.mjs [--since 2026-11-21T10:00:00Z] [--file path.jsonl]
// Without --file it reads the newest transcript (the session running this).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const since = opt("--since") ? new Date(opt("--since")).getTime() : 0;

function newestTranscript() {
  const root = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"), "projects");
  let best = null;
  for (const dir of readdirSync(root)) {
    const full = path.join(root, dir);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = path.join(full, f);
      const m = statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  }
  if (!best) throw new Error(`no transcript under ${root}`);
  return best.p;
}

const file = opt("--file") ?? newestTranscript();
const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 };
const seen = new Set();
let model;
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const u = e?.message?.usage;
  if (e.type !== "assistant" || !u) continue;
  if (since && new Date(e.timestamp).getTime() < since) continue;
  // A streamed message is written several times with the same id: count it once.
  const id = e.message.id ?? e.uuid;
  if (seen.has(id)) continue;
  seen.add(id);
  total.input += u.input_tokens ?? 0;
  total.output += u.output_tokens ?? 0;
  total.cacheRead += u.cache_read_input_tokens ?? 0;
  total.cacheWrite += u.cache_creation_input_tokens ?? 0;
  total.messages += 1;
  model = e.message.model ?? model;
}
console.log(JSON.stringify({ claude_input_tokens: total.input, claude_output_tokens: total.output, claude_cache_read_tokens: total.cacheRead, claude_cache_write_tokens: total.cacheWrite, messages: total.messages, model, transcript: path.basename(file) }));
