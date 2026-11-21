"use client";

import { useEffect, useState } from "react";

interface Token {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Connector tokens: one per agent, shown once, revocable alone. */
export function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [name, setName] = useState("Claude Code");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const load = () => fetch("/api/agent/tokens").then((r) => r.json()).then((d) => setTokens(d.tokens ?? []));
  useEffect(() => {
    load();
  }, []);
  const host = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="space-y-4 text-sm">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch("/api/agent/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((x) => x.json());
          if (r.token) setFresh({ name: r.name, token: r.token });
          load();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2" placeholder="Which agent (e.g. Claude Code on the Mac)" />
        <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
          New token
        </button>
      </form>
      {fresh && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
          <p className="font-medium">Token for {fresh.name} — shown only now. Run this once in a terminal on the computer with Claude Code:</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-neutral-900 p-2 text-xs text-green-200">{`claude mcp add --transport http mappal-agent ${host}/api/agent/mcp/${fresh.token}`}</pre>
          <button type="button" onClick={() => navigator.clipboard?.writeText(`claude mcp add --transport http mappal-agent ${host}/api/agent/mcp/${fresh.token}`)} className="mt-2 rounded-full bg-neutral-900 px-3 py-1 text-xs text-white">
            Copy
          </button>
        </div>
      )}
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {tokens.map((t) => (
          <li key={t.id} className={`flex items-center gap-2 px-3 py-2 ${t.revokedAt ? "text-neutral-400 line-through" : ""}`}>
            <span className="flex-1">
              {t.name} · made {t.createdAt.slice(0, 10)} · {t.lastUsedAt ? `last used ${t.lastUsedAt.slice(0, 16).replace("T", " ")}` : "never used"}
            </span>
            {!t.revokedAt && (
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/agent/tokens/${t.id}`, { method: "DELETE" });
                  load();
                }}
                className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
        {!tokens.length && <li className="px-3 py-2 text-neutral-500">No tokens yet. The old one from the chat no longer works.</li>}
      </ul>
    </div>
  );
}
