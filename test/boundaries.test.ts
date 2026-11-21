// docunest hard rules §3: each app is a bounded context. A domain imports only
// its own files, the shared core and npm packages; everything else reaches it
// only through domains/<app>/index.ts (CSS for its layout excepted).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
// Shared core until hosting step 1 moves it to domains/core: DB client, AI caps/usage, DeepSeek balance, MCP protocol.
const CORE = new Set(["@/lib/db", "@/lib/sources/usage", "@/lib/sources/usageDb", "@/lib/ai/deepseek", "@/lib/mcp/server"]);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);

const domains = readdirSync(path.join(ROOT, "domains")).filter((d) => statSync(path.join(ROOT, "domains", d)).isDirectory());

for (const domain of domains) {
  const base = path.join(ROOT, "domains", domain);

  test(`domains/${domain} imports only itself, core and packages`, () => {
    const bad: string[] = [];
    for (const f of files(base)) {
      for (const spec of importsOf(f)) {
        if (spec.startsWith(".")) {
          if (!path.resolve(path.dirname(f), spec).startsWith(base + path.sep)) bad.push(`${path.relative(ROOT, f)} → ${spec}`);
        } else if (spec.startsWith("@/") && !CORE.has(spec)) bad.push(`${path.relative(ROOT, f)} → ${spec}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test(`outside code reaches domains/${domain} only through its index.ts`, () => {
    const bad: string[] = [];
    for (const dir of ["app", "lib", "components", "domains"]) {
      for (const f of files(path.join(ROOT, dir))) {
        if (f.startsWith(base + path.sep)) continue;
        for (const spec of importsOf(f)) {
          const deep = spec.startsWith(`@/domains/${domain}/`) && !/\/ui\/[^/]+\.css$/.test(spec);
          const relDeep = spec.startsWith(".") && path.resolve(path.dirname(f), spec).startsWith(base + path.sep);
          if (deep || relDeep) bad.push(`${path.relative(ROOT, f)} → ${spec}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
}
